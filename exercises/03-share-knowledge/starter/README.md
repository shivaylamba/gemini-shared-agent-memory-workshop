# Starter state: Exercise 03

- Application: a **new** copy of [`core-app/`](../../../core-app), byte-identical to Exercise 01's start
  (same snapshot hash). The runner refuses to reuse the baseline workspace.
- Session: new. No conversation history from Exercises 01 or 02.
- Knowledge: read-only access to approved `/knowledge` with a `*-reader` identity and a read-scoped token.
  `/proposals` is not visible.
