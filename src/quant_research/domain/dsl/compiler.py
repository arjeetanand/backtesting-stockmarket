from typing import Any

from pydantic import BaseModel

from quant_research.domain.dsl.models import (
    ComparisonExpression,
    CrossExpression,
    ExpressionNode,
    IndicatorReference,
    LogicalExpression,
    StrategySpec,
)
from quant_research.domain.indicators.registry import IndicatorRegistry
from quant_research.domain.utils.hashing import calculate_model_hash


class CompiledStrategy(BaseModel):
    spec: StrategySpec
    indicator_dependencies: list[str]  # Topological execution order of indicator aliases
    strategy_hash: str  # Deterministic hash of StrategySpec
    execution_timing: str = "close_T_open_T_plus_1"  # Default execution model


class StrategyCompiler:
    @classmethod
    def compile(cls, spec: StrategySpec) -> CompiledStrategy:
        """Compiles a StrategySpec by validating structure and resolving indicator dependencies.

        Args:
            spec: The strategy specification model.

        Returns:
            A CompiledStrategy containing the validated spec, execution order, and hash.

        Raises:
            ValueError: If there are validation, dependency, or AST reference issues.
        """
        # 1. Validate all defined indicators against registry schemas
        for alias, ind_spec in spec.indicators.items():
            try:
                IndicatorRegistry.validate_spec(ind_spec.type, ind_spec.parameters)
            except ValueError as e:
                raise ValueError(f"Indicator '{alias}' validation failed: {e}") from e

        # 2. Extract and validate indicator references in conditions
        used_indicators: set[str] = set()
        for cond in spec.entry_conditions:
            used_indicators.update(cls._extract_indicator_refs(cond))
        for cond in spec.exit_conditions:
            used_indicators.update(cls._extract_indicator_refs(cond))

        # Check that all used indicators in conditions are actually defined
        for alias in used_indicators:
            if alias not in spec.indicators:
                raise ValueError(
                    f"Condition references indicator alias '{alias}' "
                    f"which is not defined in the indicators specification."
                )

        # 3. Resolve indicator dependency order (Topological Sort)
        ordered_indicators = cls._resolve_dependencies(spec.indicators)

        # 4. Generate deterministic hash
        strat_hash = calculate_model_hash(spec)

        return CompiledStrategy(
            spec=spec,
            indicator_dependencies=ordered_indicators,
            strategy_hash=strat_hash,
        )

    @classmethod
    def _extract_indicator_refs(cls, node: ExpressionNode) -> set[str]:
        """Recursively walk the ExpressionNode AST to extract indicator aliases."""
        refs: set[str] = set()
        if getattr(node, "type", None) == "indicator" and isinstance(node, IndicatorReference):
            refs.add(node.alias)
        elif getattr(node, "type", None) == "comparison" and isinstance(node, ComparisonExpression):
            refs.update(cls._extract_indicator_refs(node.left))
            refs.update(cls._extract_indicator_refs(node.right))
        elif getattr(node, "type", None) == "cross" and isinstance(node, CrossExpression):
            refs.update(cls._extract_indicator_refs(node.left))
            refs.update(cls._extract_indicator_refs(node.right))
        elif getattr(node, "type", None) == "logical" and isinstance(node, LogicalExpression):
            for cond in node.conditions:
                refs.update(cls._extract_indicator_refs(cond))
        return refs

    @classmethod
    def _resolve_dependencies(cls, indicators: dict[str, Any]) -> list[str]:
        """Performs a topological sort on indicators to define computation order.

        Indicators can depend on other indicators if an indicator alias is passed
        as a string parameter to another indicator.
        """
        adj: dict[str, set[str]] = {name: set() for name in indicators}
        in_degree: dict[str, int] = dict.fromkeys(indicators, 0)

        for name, ind_spec in indicators.items():
            for val in ind_spec.parameters.values():
                if isinstance(val, str) and val in indicators:
                    # val is a dependency of name (val -> name)
                    adj[val].add(name)
                    in_degree[name] += 1

        # Kahn's algorithm with sorted queue to ensure determinism
        queue = [name for name in indicators if in_degree[name] == 0]
        order: list[str] = []

        while queue:
            queue.sort()
            curr = queue.pop(0)
            order.append(curr)
            for neighbor in adj[curr]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(order) < len(indicators):
            cyclic = [name for name, deg in in_degree.items() if deg > 0]
            raise ValueError(f"Circular dependency detected among indicators: {cyclic}")

        return order
