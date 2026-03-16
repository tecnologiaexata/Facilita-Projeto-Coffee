# Facilita Coffee Counter

MVP para validar o fluxo:

`subir imagem -> anotar fruto/folhagem -> gerar CVAT -> treinar -> inferir -> devolver percentuais`

## Objetivo do projeto

Este projeto foi montado para provar que o processo abaixo funciona de ponta a ponta:

1. receber imagens reais do cafe
2. anotar classes de negocio
3. organizar dataset local
4. treinar um modelo proprio
5. processar novas imagens
6. devolver percentuais e visualizacao

A ideia do MVP nao e entregar o modelo final perfeito.
A ideia e validar a operacao, a estrutura e a jornada do produto.

## O que foi implementado

O projeto foi criado do zero em um monorepo com:

- `backend/` em FastAPI
- `frontend/` em React + Vite
- `storage/` para dataset, modelos, inferencias e arquivos auxiliares
- `docker-compose.yml` para subir tudo na porta `8050`

Hoje o sistema ja entrega:

- upload de imagem para anotacao
- anotacao manual por mascara em canvas
- exportacao de XML compativel com fluxo CVAT
- galeria das imagens anotadas
- organizacao automatica do dataset em `train`, `val` e `test`
- treino de um modelo baseline de segmentacao por pixel
- inferencia em nova imagem
- calculo de `% fruto`, `% folhagem`, `% fundo`
- visualizacao de overlay da segmentacao
- modo opcional de anotacao assistida com `SAM 2`
- monitoramento em tempo real do servidor e das tarefas do backend

## Arquitetura do MVP

### Frontend

O frontend tem quatro paginas principais:

- `Anotar + CVAT`
- `Galeria + Treino`
- `Inferencia`
- `Monitoramento`

Responsabilidades do frontend:

- receber imagem do usuario
- permitir pintura manual de mascara
- exibir sugestoes do SAM 2 quando habilitado
- mostrar galeria das anotacoes
- acionar treino do modelo
- exibir resultado visual da inferencia
- exibir percentuais calculados pelo backend
- exibir metricas em tempo real do servidor

### Backend

O backend concentra a logica do MVP:

- persistencia de imagens, mascaras e metadados
- geracao de XML CVAT
- organizacao do dataset local
- treino do modelo baseline
- inferencia em imagem nova
- calculo de percentuais por classe
- sessao opcional de anotacao assistida com SAM 2
- monitoramento de CPU, memoria, GPU e tarefas em execucao

### Storage local

Toda a operacao do MVP fica em disco, dentro de `storage/`, para manter a primeira versao simples e auditavel.

## Stack utilizada

- `FastAPI` no backend
- `scikit-learn` para o modelo baseline atual
- `OpenCV` e `Pillow` para processamento de imagem
- `React` + `Vite` no frontend
- `Nginx` para servir o frontend em producao
- `Docker` e `docker-compose` para orquestracao

## Estrutura do projeto

```text
facilita-coffe-counter/
  backend/
    app/
      config.py
      main.py
      services/
        annotation.py
        cvat.py
        modeling.py
        sam2.py
        storage.py
  frontend/
    src/
      components/
      lib/
      pages/
  storage/
  docker-compose.yml
```

## Estrutura de armazenamento

Tudo fica dentro de `storage/`:

- `dataset_anotado/images`
- `dataset_anotado/masks`
- `dataset_anotado/colored_masks`
- `dataset_anotado/overlays`
- `dataset_anotado/metadata`
- `cvat`
- `dataset/train`
- `dataset/val`
- `dataset/test`
- `models`
- `training`
- `inferences`
- `sam2/checkpoints`
- `sam2/sessions`

### O que cada pasta guarda

- `dataset_anotado/images`: imagens originais anotadas
- `dataset_anotado/masks`: mascara em classe inteira por pixel
- `dataset_anotado/colored_masks`: mascara colorida para visualizacao
- `dataset_anotado/overlays`: imagem original com sobreposicao da anotacao
- `dataset_anotado/metadata`: metadados de cada imagem anotada
- `cvat`: XMLs gerados para cada anotacao
- `dataset/train`, `dataset/val`, `dataset/test`: dataset pronto para treino
- `models`: modelo treinado atual
- `training`: relatorios de treino
- `inferences`: historico das inferencias executadas
- `sam2/checkpoints`: checkpoints oficiais do SAM 2
- `sam2/sessions`: sessoes temporarias de anotacao assistida

## Paginas da aplicacao

### 1. Anotar + CVAT

Fluxo dessa pagina:

1. usuario sobe uma imagem
2. escolhe a classe ativa
3. desenha a mascara manualmente
4. opcionalmente pede sugestao ao SAM 2
5. aplica ou corrige a sugestao
6. salva a anotacao
7. backend gera:
   - imagem salva
   - mascara salva
   - overlay salvo
   - XML CVAT

### 2. Galeria + Treino

Fluxo dessa pagina:

1. lista todas as imagens anotadas
2. mostra visualmente a anotacao
3. mostra percentuais da anotacao salva
4. permite rodar o treino do modelo baseline
5. mostra relatorio do treino mais recente

### 3. Inferencia

Fluxo dessa pagina:

1. usuario sobe uma nova imagem
2. backend carrega o modelo treinado
3. backend segmenta a imagem
4. backend conta pixels por classe
5. frontend mostra:
   - imagem original
   - overlay da segmentacao
   - percentuais
   - historico das inferencias anteriores

### 4. Monitoramento

Fluxo dessa pagina:

1. consulta o backend em polling continuo
2. mostra uso total de CPU
3. mostra uso total de memoria
4. mostra uso total de GPU, quando disponivel
5. mostra tarefas em execucao
6. mostra consumo estimado por tarefa
7. mostra historico recente de tarefas concluidas ou com falha

## Classes do projeto

O MVP usa tres classes fechadas:

- `fundo`
- `folhagem`
- `fruto`

Essas classes foram escolhidas para manter o escopo pequeno e util para o negocio.

## Modelo de producao vs SAM 2

### Como o projeto esta pensado

- `SAM 2` entra como acelerador de anotacao
- o modelo treinado com a base da empresa entra como motor de producao

### Onde o SAM 2 faz sentido

- gerar mascara inicial por clique positivo
- refinar com clique negativo
- sugerir mascara a partir de caixa
- reduzir tempo humano de anotacao

### Onde o SAM 2 nao e o ideal como resposta final

Para devolver com consistencia:

- `% fruto`
- `% folhagem`
- `% fundo`

o ideal e usar o modelo proprio treinado com as classes fechadas da operacao.

## Fluxo de trabalho recomendado

### Fluxo de negocio

1. coletar imagens reais do uso final
2. anotar `fundo`, `folhagem` e `fruto`
3. revisar qualidade da anotacao
4. gerar dataset consistente
5. treinar o modelo proprio
6. testar em imagens nunca vistas
7. medir percentuais e validar se fazem sentido para o negocio

### Fluxo dentro do sistema

1. abrir `Anotar + CVAT`
2. subir imagem
3. usar o modo manual ou o modo assistido por SAM 2
4. salvar anotacao
5. repetir ate formar base inicial
6. abrir `Galeria + Treino`
7. rodar treino
8. abrir `Inferencia`
9. subir nova imagem
10. analisar percentuais e overlay

## Como subir o projeto

### Modo padrao

Esse modo sobe o projeto sem instalar o SAM 2, deixando a imagem mais leve.

```bash
docker-compose up --build
```

Depois abra:

`http://localhost:8050`

### Porta utilizada

- frontend publico: `8050`
- backend interno entre containers: `8000`

## Como ativar o SAM 2

O projeto ja esta preparado para usar `SAM 2`, mas ele fica desligado por padrao.

### 1. Baixe um checkpoint oficial

Sugestao inicial para imagem estatica:

- `sam2.1_hiera_small.pt`

Coloque o arquivo em:

`storage/sam2/checkpoints/sam2.1_hiera_small.pt`

### 2. Suba com o build opcional do SAM 2

```bash
FCC_INSTALL_SAM2=1 \
FCC_SAM2_ENABLED=1 \
FCC_SAM2_DEVICE=cpu \
FCC_SAM2_CHECKPOINT_FILE=sam2.1_hiera_small.pt \
docker-compose up --build
```

### 3. Variaveis uteis

- `FCC_INSTALL_SAM2=1`: instala dependencias do SAM 2 no build do backend
- `FCC_SAM2_ENABLED=1`: habilita o uso do SAM 2 na aplicacao
- `FCC_SAM2_DEVICE=cpu`: roda em CPU
- `FCC_SAM2_DEVICE=cuda`: roda em GPU, se houver suporte no host
- `FCC_SAM2_CHECKPOINT_FILE=sam2.1_hiera_small.pt`: nome do checkpoint dentro de `storage/sam2/checkpoints`
- `FCC_SAM2_CONFIG=configs/sam2.1/sam2.1_hiera_s.yaml`: config do checkpoint escolhido

### Configs uteis do SAM 2.1

- `configs/sam2.1/sam2.1_hiera_t.yaml`
- `configs/sam2.1/sam2.1_hiera_s.yaml`
- `configs/sam2.1/sam2.1_hiera_b+.yaml`

## Endpoints principais da API

### Saude e metadados

- `GET /api/health`
- `GET /api/meta`
- `GET /api/training`
- `GET /api/sam2/status`
- `GET /api/monitoring`

### Anotacao

- `GET /api/annotations`
- `POST /api/annotations`

### Treino

- `POST /api/training/run`

### Inferencia

- `GET /api/inferences`
- `POST /api/inference`

### SAM 2

- `POST /api/sam2/sessions`
- `POST /api/sam2/sessions/{session_id}/predict`

## O que acontece em cada etapa tecnica

### Ao salvar uma anotacao

O backend:

1. recebe imagem e mascara
2. converte a mascara para ids de classe
3. gera mascara colorida
4. gera overlay
5. calcula distribuicao de pixels
6. salva metadados
7. gera XML CVAT correspondente

### Ao rodar o treino

O backend:

1. le todas as anotacoes
2. monta split automatico de treino, validacao e teste
3. extrai features por pixel
4. treina um `RandomForestClassifier`
5. salva o modelo atual
6. salva relatorio com metricas

### Ao rodar uma inferencia

O backend:

1. carrega o modelo treinado
2. extrai features da nova imagem
3. prediz classe por pixel
4. gera mascara prevista
5. gera overlay
6. conta pixels por classe
7. calcula:
   - percentual da imagem total
   - percentual da area de cafe
8. salva historico da inferencia

## Percentuais calculados

O sistema devolve:

- `fruto_percentual_na_imagem`
- `folhagem_percentual_na_imagem`
- `fundo_percentual_na_imagem`
- `area_cafe_percentual`
- `fruto_percentual_na_area_cafe`
- `folhagem_percentual_na_area_cafe`

Onde:

- `area_cafe = fruto + folhagem`

## Estado atual do projeto

No estado atual:

- o sistema esta operacional na porta `8050`
- o fluxo manual de anotacao esta pronto
- a galeria e o treino estao prontos
- a inferencia e o calculo de percentuais estao prontos
- o SAM 2 esta integrado de forma opcional
- por padrao, o SAM 2 aparece como desativado ate o checkpoint e o build opcional serem habilitados

## Validacoes ja executadas

Durante a implementacao, foi validado:

- compilacao do backend Python
- build do frontend com Vite
- build Docker de backend e frontend
- subida dos containers
- resposta dos endpoints principais
- fluxo sintetico de anotacao, treino e inferencia

## Observacoes importantes

### Sobre o modelo atual

O modelo atual do MVP e um baseline leve por pixel com `RandomForest`.
Ele foi escolhido para provar o fluxo rapidamente sem depender de GPU.

### Sobre evolucao futura

Quando a base estiver maior e mais consistente, a evolucao natural e trocar o modelo baseline por um modelo de segmentacao mais forte, por exemplo:

- `U-Net`
- `YOLO Segmentation`
- `SegFormer`

mantendo o `SAM 2` como ferramenta de anotacao assistida.

### Sobre anotacao consistente

O ponto mais importante para o sucesso do projeto nao e apenas o modelo.
E a consistencia da anotacao.

Antes de ganhar escala, vale definir claramente:

- o que conta como fruto
- o que conta como folhagem
- o que vira fundo
- como tratar galho, solo, borrado e oclusao

## Resumo da estrategia

O melhor desenho para esse projeto hoje e:

- `SAM 2` para acelerar anotacao de imagens
- humano para revisar
- dataset final para treinar o modelo proprio
- modelo proprio para rodar em producao
- percentuais calculados no backend com base na segmentacao final

Esse e o fluxo que o projeto atual ja deixa preparado.
