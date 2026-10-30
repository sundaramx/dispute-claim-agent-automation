"""Domain money type — integer minor units, USD only (FR-20, NFR-11).

All monetary values are stored as integers in the smallest currency unit
(e.g. cents for USD). Floats are never used to avoid rounding errors.
"""

from __future__ import annotations

from decimal import ROUND_HALF_EVEN, Decimal


class Money:
    """Immutable money value in minor units (cents for USD)."""

    __slots__ = ("_minor", "_currency")
    _minor: int
    _currency: str

    def __init__(self, amount: int, currency: str = "USD") -> None:
        if currency != "USD":
            raise ValueError(f"Only USD is supported, got {currency!r}")
        if isinstance(amount, bool) or not isinstance(amount, int):
            raise TypeError(f"Expected int minor units, got {type(amount).__name__}")
        if amount < 0:
            raise ValueError("Negative amounts are not allowed")
        object.__setattr__(self, "_minor", amount)
        object.__setattr__(self, "_currency", currency)

    @classmethod
    def from_major(cls, amount: Decimal, currency: str = "USD") -> Money:
        """Build from a Decimal amount in major units (dollars), max 2 places."""
        if isinstance(amount, bool) or not isinstance(amount, Decimal):
            raise TypeError(f"Expected Decimal, got {type(amount).__name__}")
        if not amount.is_finite():
            raise ValueError(f"Decimal amount must be finite: {amount}")
        exp = amount.as_tuple().exponent
        if isinstance(exp, int) and exp < -2:
            raise ValueError(f"Decimal amount has more than 2 decimal places: {amount}")
        return cls(int(amount * 100), currency)

    def __setattr__(self, name: str, value: object) -> None:
        raise AttributeError("Money is immutable")

    def __delattr__(self, name: str) -> None:
        raise AttributeError("Money is immutable")

    @property
    def minor(self) -> int:
        """Amount in minor units (cents)."""
        return self._minor

    @property
    def major(self) -> Decimal:
        """Amount in major units (dollars) for display."""
        return Decimal(self._minor) / 100

    @property
    def currency(self) -> str:
        return self._currency

    def __add__(self, other: Money) -> Money:
        if not isinstance(other, Money):
            return NotImplemented
        if self.currency != other.currency:
            raise TypeError("Cannot add different currencies")
        return Money(self.minor + other.minor, self.currency)

    def __sub__(self, other: Money) -> Money:
        if not isinstance(other, Money):
            return NotImplemented
        if self.currency != other.currency:
            raise TypeError("Cannot subtract different currencies")
        result = self.minor - other.minor
        if result < 0:
            raise ValueError("Subtraction would produce a negative amount")
        return Money(result, self.currency)

    def __mul__(self, other: int | Decimal) -> Money:
        """Multiply by an integer or Decimal with explicit rounding (ROUND_HALF_EVEN)."""
        # Reject bool and float
        if isinstance(other, bool):
            raise TypeError("Expected int or Decimal, got bool")
        if isinstance(other, float):
            return NotImplemented
        if isinstance(other, int):
            result = self.minor * other
        elif isinstance(other, Decimal):
            raw = Decimal(str(self.minor)) * other
            result = int(raw.quantize(Decimal("1"), rounding=ROUND_HALF_EVEN))
        else:
            return NotImplemented

        if result < 0:
            raise ValueError("Multiplication would produce a negative amount")
        return Money(result, self.currency)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Money):
            return NotImplemented
        return self.minor == other.minor and self.currency == other.currency

    def __lt__(self, other: Money) -> bool:
        if not isinstance(other, Money):
            return NotImplemented
        if self.currency != other.currency:
            raise TypeError("Cannot compare different currencies")
        return self.minor < other.minor

    def __le__(self, other: Money) -> bool:
        return self == other or self < other

    def __repr__(self) -> str:
        return f"Money({self.minor} {self.currency})"

    def __hash__(self) -> int:
        return hash((self._minor, self._currency))


__all__ = ["Money"]
