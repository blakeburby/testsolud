"""
Trading strategies.
"""
from .base import BaseStrategy
from .high_confidence_threshold import HighConfidenceThresholdStrategy

__all__ = [
    "BaseStrategy",
    "HighConfidenceThresholdStrategy",
]
