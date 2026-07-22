from pydantic import BaseModel, Field


class SMAParameters(BaseModel):
    period: int = Field(..., gt=0, description="Lookback period for SMA")


class EMAParameters(BaseModel):
    period: int = Field(..., gt=0, description="Lookback period for EMA")


class RSIParameters(BaseModel):
    period: int = Field(..., gt=0, description="Lookback period for RSI")


class MACDParameters(BaseModel):
    fast_period: int = Field(12, gt=0, description="Fast EMA period")
    slow_period: int = Field(26, gt=0, description="Slow EMA period")
    signal_period: int = Field(9, gt=0, description="Signal Line period")


class ATRParameters(BaseModel):
    period: int = Field(..., gt=0, description="Lookback period for ATR")
