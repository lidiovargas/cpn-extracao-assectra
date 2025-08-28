# Usa uma imagem base oficial do Node.js com o sistema operacional Debian (Bullseye).
FROM node:18-bullseye-slim

# Instala as dependências de sistema recomendadas oficialmente pela equipe do Puppeteer
# para rodar o Chromium em um ambiente Debian. Isso resolve todos os erros de 
# "cannot open shared object file".
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
  ca-certificates \
  fonts-liberation \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgbm1 \
  libgcc1 \
  libgconf-2-4 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  lsb-release \
  wget \
  xdg-utils \
  # Limpa o cache do apt para manter a imagem pequena.
  && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho dentro do container.
WORKDIR /usr/src/app

# Copia os arquivos de definição de pacotes.
COPY package*.json ./

# Instala todas as dependências (incluindo devDependencies para o build).
RUN npm install

# Copia o restante dos arquivos do projeto.
COPY . .

# Executa o script de build para compilar o código de src/ para dist/.
RUN npm run build

# Comando padrão que será executado quando o container iniciar.
# Ele executa o código já compilado na pasta 'dist'.
CMD [ "npm", "start" ]
