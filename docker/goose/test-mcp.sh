#!/bin/sh
docker compose run --rm --entrypoint /bin/sh goose -c 'curl -s -X POST http://host.docker.internal:8000/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2024-11-05\",\"capabilities\":{},\"clientInfo\":{\"name\":\"test\",\"version\":\"1.0\"}},\"id\":1}"'
