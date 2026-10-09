"""Common models and base classes for schemas."""

from typing import Any
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model with camelCase aliasing for JSON serialization."""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ErrorBody(BaseModel):
    code: str
    message: str
    detail: Any = None


class ErrorResponse(BaseModel):
    error: ErrorBody
