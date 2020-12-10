# Load Tests

[K6](https://k6.io/) Load tests.

## Setup

-   [Install K6](https://k6.io/docs/getting-started/installation) on your machine.
    -   On Mac: `brew install k6`
    -   On Windows: `choco install k6`
    -   On Linux: Follow the instructions [here](https://k6.io/docs/getting-started/installation#linux).

## Running

To run the load tests, simply `cd` into this directory and execute `k6 run name-of-test.js`.

For example to test connecting to the server run `k6 run connect-and-do-nothing.load-test.js`.
