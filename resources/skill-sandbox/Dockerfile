FROM node:22-bookworm-slim
ARG CODEX_VERSION=0.114.0
RUN npm install -g @openai/codex@${CODEX_VERSION} && npm cache clean --force
ENV HOME=/tmp/home CODEX_HOME=/tmp/home/.codex
WORKDIR /workspace
ENTRYPOINT ["codex"]
