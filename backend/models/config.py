"""
Configuration models using Pydantic for validation.
"""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class RiskConfig(BaseModel):
    """Risk management configuration."""
    max_position_size: float = Field(default=1000, gt=0, description="Maximum position size in dollars")
    max_daily_loss: float = Field(default=500, gt=0, description="Maximum daily loss in dollars")
    max_concurrent_positions: int = Field(default=5, ge=1, description="Maximum number of concurrent positions")
    circuit_breaker_loss_threshold: float = Field(default=0.20, gt=0, lt=1, description="Loss threshold to trigger circuit breaker")
    circuit_breaker_drawdown_threshold: float = Field(default=0.15, gt=0, lt=1, description="Drawdown threshold to trigger circuit breaker")
    min_edge_threshold: float = Field(default=0.02, ge=0, description="Minimum edge required to trade")
    uncertainty_buffer: float = Field(default=0.03, ge=0, description="Buffer for model uncertainty")


class StrategyConfig(BaseModel):
    """Strategy-specific configuration."""
    name: str
    enabled: bool = True
    bankroll: float = Field(default=10000, gt=0)
    kelly_fraction: float = Field(default=0.25, gt=0, le=1, description="Fraction of Kelly to use (0.25 = quarter Kelly)")
    min_confidence: float = Field(default=0.5, ge=0, le=1, description="Minimum confidence to trade")
    max_leverage: float = Field(default=1.0, ge=1, description="Maximum leverage allowed")

    # Strategy-specific parameters
    params: dict = Field(default_factory=dict)


class TradingConfig(BaseSettings):
    """Main trading configuration loaded from environment."""

    # Kalshi API
    kalshi_api_key: str = Field(..., description="Kalshi API key")
    kalshi_private_key_path: Optional[str] = Field(None, description="Path to Kalshi private key file")
    kalshi_private_key: Optional[str] = Field(None, description="Kalshi private key content")
    kalshi_api_base_url: str = Field(default="https://api.elections.kalshi.com/trade-api/v2")
    kalshi_demo_mode: bool = Field(default=False)

    # Supabase (optional for logging)
    supabase_url: Optional[str] = Field(default=None, description="Supabase project URL")
    supabase_key: Optional[str] = Field(default=None, description="Supabase anon key")

    # Trading Parameters
    dry_run_mode: bool = Field(default=True, description="Paper trading mode (no real orders)")
    enabled_strategies: List[str] = Field(default=["kelly_volatility"])
    default_bankroll: float = Field(default=10000, gt=0)

    # Risk Management (fields can be provided at top level with RISK_ prefix or directly)
    max_position_size: Optional[float] = None
    max_daily_loss: Optional[float] = None
    max_concurrent_positions: Optional[int] = None
    circuit_breaker_loss_threshold: Optional[float] = None
    circuit_breaker_drawdown_threshold: Optional[float] = None
    min_edge_threshold: Optional[float] = None
    uncertainty_buffer: Optional[float] = None

    # Server Settings
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000, ge=1024, le=65535)
    log_level: str = Field(default="INFO")
    environment: str = Field(default="development")

    # WebSocket
    ws_heartbeat_interval: int = Field(default=30, ge=1)
    ws_reconnect_delay: int = Field(default=5, ge=1)

    # Database
    db_pool_size: int = Field(default=10, ge=1)
    db_max_overflow: int = Field(default=20, ge=0)

    # Monitoring
    enable_performance_metrics: bool = Field(default=True)
    metrics_export_interval: int = Field(default=60, ge=1)

    @model_validator(mode='after')
    def validate_and_build(self):
        """Validate fields and build nested objects."""
        # Validate private key
        if not self.kalshi_private_key and not self.kalshi_private_key_path:
            raise ValueError('Either kalshi_private_key or kalshi_private_key_path must be provided')
        return self

    @property
    def risk(self) -> RiskConfig:
        """Build RiskConfig from flat fields."""
        return RiskConfig(
            max_position_size=self.max_position_size or 1000,
            max_daily_loss=self.max_daily_loss or 500,
            max_concurrent_positions=self.max_concurrent_positions or 5,
            circuit_breaker_loss_threshold=self.circuit_breaker_loss_threshold or 0.20,
            circuit_breaker_drawdown_threshold=self.circuit_breaker_drawdown_threshold or 0.15,
            min_edge_threshold=self.min_edge_threshold or 0.02,
            uncertainty_buffer=self.uncertainty_buffer or 0.03,
        )

    @field_validator('enabled_strategies', mode='before')
    @classmethod
    def parse_strategies(cls, v):
        """Parse comma-separated strategies string."""
        if isinstance(v, str):
            return [s.strip() for s in v.split(',') if s.strip()]
        return v

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        # Don't try to parse lists as JSON
        env_parse_none_str="null"
    )
