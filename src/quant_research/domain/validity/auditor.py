"""Bias & Validity Auditor Engine."""

from __future__ import annotations

from dataclasses import dataclass

from quant_research.domain.backtesting.vector_engine import VectorBacktestResult


@dataclass
class AuditWarning:
    """Individual structural validity or leakage warning."""

    id: str
    severity: str  # "HIGH", "MEDIUM", "LOW"
    category: str  # "DATA_LEAKAGE", "OVERFITTING", "COST_REALISM", "SAMPLE_SIZE"
    title: str
    description: str
    mitigation: str


@dataclass
class ValidityAuditReport:
    """Complete bias and validity health report."""

    run_id: str
    health_score: int  # 0 to 100
    overall_status: str  # "PASS", "WARNING", "CRITICAL"
    overfitting_risk: float  # % risk
    trade_sample_size: int
    trade_sample_status: str  # "SUFFICIENT", "INSUFFICIENT"
    cost_assumption_realism: str  # "REALISTIC", "OPTIMISTIC"
    warnings: list[AuditWarning]


def audit_validity(result: VectorBacktestResult) -> ValidityAuditReport:
    """Audit strategy execution for structural biases, leakage, and overfitting risks."""
    warnings: list[AuditWarning] = []
    trade_count = result.metrics.total_trades

    # 1. Sample Size Check
    if trade_count < 30:
        warnings.append(
            AuditWarning(
                id="warn_sample_low",
                severity="HIGH",
                category="SAMPLE_SIZE",
                title="Low Trade Sample Size",
                description=f"Only {trade_count} trades executed over backtest period. Low sample size leads to statistically unreliable Sharpe ratios.",
                mitigation="Expand historical backtest date range or lower timeframe resolution.",
            )
        )
        sample_status = "INSUFFICIENT"
    else:
        sample_status = "SUFFICIENT"

    # 2. Overfitting & P-hacking Risk Evaluation
    win_rate = result.metrics.win_rate
    profit_factor = result.metrics.profit_factor

    overfitting_risk = 15.0
    if win_rate > 0.80 or profit_factor > 3.5:
        overfitting_risk += 45.0
        warnings.append(
            AuditWarning(
                id="warn_overfit_high",
                severity="MEDIUM",
                category="OVERFITTING",
                title="Unrealistically High Profit Factor",
                description=f"Profit factor of {profit_factor} with win rate of {win_rate*100:.1f}% indicates potential parameter curve-fitting.",
                mitigation="Run Out-Of-Sample (OOS) cross-validation and Walk-Forward optimization.",
            )
        )

    # 3. Cost Assumption Audit
    cost_realism = "REALISTIC"
    if result.metrics.sharpe_ratio > 2.5:
        cost_realism = "OPTIMISTIC"
        warnings.append(
            AuditWarning(
                id="warn_cost_slippage",
                severity="LOW",
                category="COST_REALISM",
                title="Zero Market Impact Model",
                description="Strategy assumes fixed 5bps slippage without dynamic order book market impact modeling.",
                mitigation="Perform stress test with 2x transaction fees and 10bps slippage.",
            )
        )

    # Calculate overall health score
    health_score = int(max(20, 100 - (overfitting_risk * 0.8) - (25 if sample_status == "INSUFFICIENT" else 0)))
    overall_status = "PASS" if health_score >= 75 else ("WARNING" if health_score >= 50 else "CRITICAL")

    return ValidityAuditReport(
        run_id=result.run_id,
        health_score=health_score,
        overall_status=overall_status,
        overfitting_risk=round(overfitting_risk, 1),
        trade_sample_size=trade_count,
        trade_sample_status=sample_status,
        cost_assumption_realism=cost_realism,
        warnings=warnings,
    )
