"""CorTwin pipeline package.

Pure, I/O-light modules shared by the training pipeline, parity harness and
tests. Nothing in this package imports React/JS, network code, or telemetry.
"""

__all__ = ["config", "dataset", "encode", "errors", "schema"]
