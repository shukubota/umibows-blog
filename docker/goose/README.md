## usage

build
```bash
docker build -t my-goose .
```

run
```bash
direnv allow
docker run -it \                                                 
    -e GOOGLE_API_KEY=$GOOGLE_AI_API_KEY \                         
    -e GOOSE_PROVIDER=google \                                     
    -e GOOSE_MODEL=gemini-2.0-flash \                              
my-goose
```

### with mcp
```bash
node ./mcp/server.js
```


```bash
docker compose run goose
```

で

mcpの疎通確認
```shell
./test-mcp.sh
```
で
```
event: message
data: {"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":true}},"serverInfo":{"name":"blog-tools","version":"1.0.0"}},"jsonrpc":"2.0","id":1}
```
が帰ればOK

gooseからの疎通確認。

```shell
mcpで使えるtool一覧を教えて
```
でmy-tool関連情報が出てくる
