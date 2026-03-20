FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    curl \
    git \
    ca-certificates \
    bzip2 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# gooseのインストール（CONFIGURE=false でインタラクティブ設定をスキップ）
RUN curl -fsSL https://github.com/block/goose/releases/download/stable/download_cli.sh | CONFIGURE=false bash

# gooseの実行バイナリにパスを通す
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /home/goose

ENTRYPOINT ["goose"]
CMD ["session"]
