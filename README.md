# 🥗 API de Alimentos Brasileira (TACO) – Projeto Tech Chef

Este projeto implementa uma **API própria de alimentos em português (PT-BR)**, baseada na **Tabela Brasileira de Composição de Alimentos (TACO)**, com o objetivo de servir como base para aplicações de planejamento alimentar, cálculo nutricional e receitas personalizadas.

Ele integra **conhecimento da área de alimentos** com **engenharia de software**, sendo parte do desenvolvimento do projeto **Tech Chef – Consultoria Alimentar Familiar**.

---

## 🎯 Objetivo do projeto

* Criar um banco de dados nutricional nacional, estruturado e confiável
* Disponibilizar os alimentos via API (REST)
* Permitir cálculo nutricional por porção e por receita
* Servir como backend para o app Flutter *Tech Chef*
* Ser base técnica para o TCC do curso de Análise e Desenvolvimento de Sistemas

---

## 🧱 Tecnologias utilizadas

* **Node.js + TypeScript**
* **Firebase Firestore (Emulator)**
* **Firebase Functions**
* **Firebase Emulator Suite**
* **TACO (IBGE) como fonte nutricional**
* **VSCode**

---

## 📦 Estrutura do projeto

```
minhaAPI/
│
├─ functions/               # Cloud Functions (API)
│   └─ src/index.ts
│
├─ tools/
│   └─ import/              # Scripts de importação (TACO → Firestore)
│       ├─ taco_to_foods_json.ts
│       └─ import_foods_to_firestore.ts
│
├─ firestore.rules
├─ firebase.json
├─ README.md
└─ .gitignore
```

---

## 🚀 Como rodar o projeto (ambiente de desenvolvimento)

### 1️⃣ Instalar dependências

```bash
npm install
```

### 2️⃣ Iniciar os emuladores

```bash
firebase emulators:start --only firestore,functions
```

* Firestore: [http://127.0.0.1:8080](http://127.0.0.1:8080)
* UI: [http://127.0.0.1:4000](http://127.0.0.1:4000)

---

### 3️⃣ Importar os alimentos (TACO)

Em outro terminal:

```bash
cd tools/import
$env:FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
$env:GCLOUD_PROJECT="minha2pi"
npx ts-node -P .\tsconfig.json .\import_foods_to_firestore.ts
```

---

## 🔌 Endpoints disponíveis (emulador)

### 🔍 Buscar alimentos

```
GET /foods?q=arroz&limit=10
```

### 📄 Listar alimentos

```
GET /foods?limit=10
```

### 🧬 Detalhes de um alimento

```
GET /food?id=1
```

Exemplo:

```
http://127.0.0.1:5001/minha2pi/southamerica-east1/foods?q=arroz
```

---

## 🧠 Próximos passos (em desenvolvimento)

* Busca sem acento e case-insensitive
* Cálculo nutricional por porção
* Cadastro de receitas próprias
* Integração com Flutter (Tech Chef)
* Persistência automática do emulador
* Publicação em ambiente de produção

---

## 📚 Contexto acadêmico

Este projeto faz parte do TCC:

**Tech Chef – Consultoria Alimentar Familiar**
Curso: Análise e Desenvolvimento de Sistemas
Autor: Regis

O foco é unir **nutrição, tecnologia e planejamento alimentar familiar** em uma solução prática e acessível.

---

## ⚠️ Observações

* Este repositório usa **emuladores Firebase** (dados não persistem sem export)
* Não subir dados reais para produção sem revisão das regras
* O `.gitignore` já bloqueia arquivos sensíveis e dados locais

---

## 💬 Contato

Projeto em desenvolvimento.
Dúvidas ou sugestões: abrir issue no repositório.
