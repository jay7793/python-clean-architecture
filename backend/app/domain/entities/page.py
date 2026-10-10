from dataclasses import dataclass
from math import ceil


@dataclass(frozen=True, slots=True)
class Page[T]:
    data: list[T]
    page: int
    page_size: int
    total_data: int

    @property
    def total_page(self) -> int:
        return ceil(self.total_data / self.page_size)
