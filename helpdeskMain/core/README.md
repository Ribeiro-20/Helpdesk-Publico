# Core

The `core` app contains shared models, serializers, and utility functions used across the project.

## Purpose

This app stores the global data structures and helpers used by multiple application modules. It is the central place for:

- common database models
- shared serializers and validation logic
- global utilities used across the project
- base behavior for transactions and service registrations

## Current responsibilities

- defining reusable database models for transactions, contracts, and shared entities
- providing shared serializers and request/response transformations
- exposing common helper functions and mappings used by other apps
- keeping project-wide domain concepts centralized

## Typical usage

Import shared models, serializers, or helpers from `core` in other apps:

```python
from core import models
from core import serializer
```

## Why it matters

`core` is the default location for shared behavior and global domain objects. When multiple apps need the same database models, status enums, or transformation logic, they belong here rather than being duplicated.

## Extensibility

Keep the `core` app focused on reusable pieces. Avoid putting app-specific business logic here. If a feature is used by several modules, it should reside in `core`.
