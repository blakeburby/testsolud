"""
Kalshi API authentication using RSA-PSS signatures.
"""
import time
from pathlib import Path
from typing import Optional
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.backends import default_backend
import base64


class KalshiAuth:
    """
    Handles Kalshi API authentication with RSA-PSS signatures.
    """

    def __init__(
        self,
        api_key: str,
        private_key_path: Optional[str] = None,
        private_key_content: Optional[str] = None,
    ):
        """
        Initialize Kalshi authentication.

        Args:
            api_key: Kalshi API key
            private_key_path: Path to PEM-formatted private key file
            private_key_content: Private key content as string (alternative to file)

        Raises:
            ValueError: If neither private_key_path nor private_key_content is provided
        """
        self.api_key = api_key

        if private_key_path:
            self.private_key = self._load_private_key_from_file(private_key_path)
        elif private_key_content:
            self.private_key = self._load_private_key_from_string(private_key_content)
        else:
            raise ValueError("Either private_key_path or private_key_content must be provided")

    def _load_private_key_from_file(self, key_path: str):
        """Load private key from PEM file."""
        path = Path(key_path)
        if not path.exists():
            raise FileNotFoundError(f"Private key file not found: {key_path}")

        with open(path, "rb") as key_file:
            private_key = serialization.load_pem_private_key(
                key_file.read(),
                password=None,
                backend=default_backend()
            )
        return private_key

    def _load_private_key_from_string(self, key_content: str):
        """Load private key from string content."""
        # Ensure proper PEM formatting
        if not key_content.startswith("-----BEGIN"):
            raise ValueError("Private key must be in PEM format (BEGIN PRIVATE KEY)")

        private_key = serialization.load_pem_private_key(
            key_content.encode('utf-8'),
            password=None,
            backend=default_backend()
        )
        return private_key

    def sign_request(self, method: str, path: str, timestamp: Optional[str] = None) -> str:
        """
        Generate RSA-PSS signature for Kalshi API request.

        Args:
            method: HTTP method (GET, POST, DELETE, etc.)
            path: API path (e.g., /trade-api/v2/markets/TICKER)
            timestamp: Unix timestamp in milliseconds (auto-generated if not provided)

        Returns:
            Base64-encoded signature
        """
        if timestamp is None:
            timestamp = str(int(time.time() * 1000))

        # Kalshi signature format: timestamp + method + path
        message = f"{timestamp}{method}{path}"

        # Sign with RSA-PSS
        signature = self.private_key.sign(
            message.encode('utf-8'),
            padding.PSS(
                mgf=padding.MGF1(hashes.SHA256()),
                salt_length=32  # Kalshi requires 32-byte salt
            ),
            hashes.SHA256()
        )

        # Base64 encode
        return base64.b64encode(signature).decode('utf-8')

    def get_headers(self, method: str, path: str) -> dict:
        """
        Generate authentication headers for Kalshi API request.

        Args:
            method: HTTP method
            path: API path

        Returns:
            Dictionary of headers including signature
        """
        timestamp = str(int(time.time() * 1000))
        signature = self.sign_request(method, path, timestamp)

        return {
            "KALSHI-ACCESS-KEY": self.api_key,
            "KALSHI-ACCESS-TIMESTAMP": timestamp,
            "KALSHI-ACCESS-SIGNATURE": signature,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def verify_key_format(self) -> bool:
        """
        Verify that the private key is in the correct format.

        Returns:
            True if key is valid
        """
        try:
            # Try to sign a test message
            test_sig = self.sign_request("GET", "/test")
            return len(test_sig) > 0
        except Exception as e:
            raise ValueError(f"Invalid private key format: {e}")
