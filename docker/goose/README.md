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
