# Facilita Coffee Counter

Versao simplificada do projeto para o fluxo:

`subir foto + txt externo -> salvar na galeria -> treinar modelo -> analisar novas imagens`

## O que o projeto faz hoje

- recebe uma foto e um arquivo `.txt` de anotacao vindo de site terceiro
- converte o `.txt` em mascara interna para treino
- salva tudo na galeria com imagem, overlay, metadados e copia do txt
- treina um modelo baseline de segmentacao por pixel
- analisa novas imagens com o ultimo modelo treinado
- salva historico das inferencias com percentuais e overlay

## O que foi removido

- anotacao manual no navegador
- edicao interna de mascara
- rotas de monitoramento no frontend
- configuracao por arquivo de ambiente local
- suporte opcional ao `SAM 2`

## Estrutura principal

```text
facilita-Projeto-Contagem/
  backend/
    app/
      config.py
      main.py
      services/
        annotation.py
        cvat.py
        modeling.py
        monitoring.py
        storage.py
  frontend/
    src/
      App.jsx
      lib/api.js
      main.jsx
      styles.css
  storage/
  docker-compose.yml
```

## Armazenamento

Os dados continuam sendo persistidos localmente em `storage/`:

- `dataset_anotado/images`
- `dataset_anotado/masks`
- `dataset_anotado/colored_masks`
- `dataset_anotado/overlays`
- `dataset_anotado/metadata`
- `dataset_anotado/annotation_texts`
- `cvat`
- `dataset/train`
- `dataset/val`
- `dataset/test`
- `models`
- `training`
- `inferences`

## Como subir

```bash
docker-compose up --build
```

Depois abra:

`http://localhost:8050`

## Fluxo da interface

### 1. Galeria

Envie:

- uma foto
- um `.txt` com as anotacoes externas

O backend interpreta o `.txt` em formato YOLO de poligono ou bounding box. Tambem aceita cabecalho opcional como:

```txt
# class-map: 0=folhagem, 1=fruto
0 0.10 0.10 0.90 0.10 0.90 0.90 0.10 0.90
1 0.35 0.30 0.30 0.22
```

### 2. Treino

O treino e manual. O sistema so treina quando o botao `Treinar modelo` e acionado.

### 3. Inferencia

A analise de novas imagens usa apenas o ultimo modelo treinado e salva o resultado no historico de inferencias.

## Endpoints principais

- `GET /api/health`
- `GET /api/meta`
- `GET /api/gallery`
- `POST /api/gallery`
- `GET /api/gallery/{sample_id}`
- `DELETE /api/gallery/{sample_id}`
- `GET /api/gallery/{sample_id}/package`
- `GET /api/training`
- `POST /api/training/run`
- `GET /api/training/model`
- `GET /api/inferences`
- `POST /api/inference`
- `DELETE /api/inferences/{run_id}`

## Validacoes executadas

- compilacao do backend Python
- build do frontend com Vite
- smoke test do fluxo `galeria -> treino -> inferencia` em container
