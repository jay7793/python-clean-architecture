from typing import Annotated

from fastapi import Query

MAX_PAGE_SIZE = 1000
# Far past any real list, and small enough that the OFFSET it becomes cannot overflow.
MAX_PAGE = 10_000

PageNumber = Annotated[int, Query(alias="_page", ge=1, le=MAX_PAGE)]
PageSize = Annotated[int, Query(alias="_pageSize", ge=1, le=MAX_PAGE_SIZE)]
