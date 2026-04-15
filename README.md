# 📄 PDF Metadata & Font Inspector

A lightweight Node.js tool to extract and analyze PDF metadata, fonts, and accessibility-related information.

---

## 🚀 Features

* Extract **XMP metadata** (XML)
* Extract **Document Info** (Title, Author, etc.)
* Detect **PDF version**
* Extract **fonts (global)**
* Extract **page-wise font usage**
* Detect **A11Y issues**

  * Pages without fonts (image-only pages)
  * Missing fonts per page
  * Tagged PDF detection
  * Language detection

---

## 📦 Output Types

### 1. XMP Metadata (XML)

* Raw XMP packet extracted from PDF

### 2. Fonts JSON

* List of fonts used in the document
* Embedded / subset info

### 3. Full Report (JSON)

Includes:

```json
{
  "version": "1.7",
  "info": {},
  "lang": "en-US",
  "pages": 10,
  "tagged": true,
  "fonts": [],
  "page_fonts": [],
  "a11y": {},
  "has_xmp": true
}
```

---

## 🛠 Tech Stack

* Node.js
* Express.js
* Multer (file upload)
* Native Buffer + RegEx PDF parsing

---

## 📂 Project Structure

```
project/
│
├── server.js
├── package.json
│
├── public/
│   ├── index.html
│   ├── script.js
│   └── style.css
│
└── uploads/   (temporary files)
```

---

## ⚙️ Installation

### 1. Clone repo

```
git clone https://github.com/your-username/pdf-metadata-tool.git
cd pdf-metadata-tool
```

### 2. Install dependencies

```
npm install
```

---

## ▶️ Run the Server

### Option 1 (basic)

```
node server.js
```

### Option 2 (recommended - auto restart)

Install nodemon:

```
npm install -g nodemon
```

Run:

```
nodemon server.js
```

---

## 🌐 Open in Browser

```
http://localhost:3000
```

---

## 🧪 API Endpoints

### 1. Extract XMP

```
POST /upload
```

Response:

* XML file download

---

### 2. Extract Fonts

```
POST /fonts
```

Response:

* fonts.json

---

### 3. Full Report

```
POST /report
```

Response:

* report.json

---

## 📊 Example A11Y Output

```json
{
  "a11y": {
    "pages_without_fonts": [3],
    "missing_fonts_by_page": [
      {
        "page": 1,
        "missing": ["MinionPro"]
      }
    ]
  }
}
```

---

## ⚠️ Limitations

* Uses **regex-based PDF parsing**
* Not a full PDF parser
* Font extraction is metadata-level (not binary fonts)
* Complex PDFs may have edge cases

---

## 💡 Use Cases

* PDF Accessibility (A11Y) checks
* Preflight validation
* Debugging InDesign exports
* Metadata inspection
* Automation pipelines

---

## 🔥 Future Improvements

* Page size & rotation extraction
* Image detection
* XMP + Info merge
* A11Y rule engine
* GUI preview panel

---

## 🧠 Notes

* UTF-16 encoded metadata is automatically decoded
* PDF dates are normalized
* Supports FlateDecode streams for XMP

---

## 📜 License

MIT License

---

## 🙌 Author

Built for practical PDF inspection & automation workflows.
