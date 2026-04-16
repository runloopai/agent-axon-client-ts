FROM runloop:runloop/starter-arm64

RUN npm install -g @zed-industries/codex-acp

USER user
WORKDIR /home/user

RUN curl -fsSL https://claude.ai/install.sh | bash
RUN curl -fsSL https://opencode.ai/install | bash
RUN curl https://cursor.com/install -fsS | bash
