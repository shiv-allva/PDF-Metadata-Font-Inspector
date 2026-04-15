// server.js - Enhanced PDF XMP extractor (handles FlateDecode metadata streams)
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const app = express();
// limit: 20 MB
const upload = multer({ dest: 'uploads/', limits: { fileSize: 20 * 1024 * 1024 } });

// --- FIXED SECTION: Serve static files with explicit MIME types ---
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.type('text/css');
    } else if (filePath.endsWith('.js')) {
      res.type('application/javascript');
    } else if (filePath.endsWith('.html')) {
      res.type('text/html; charset=utf-8');
    }
  }
}));
// -----------------------------------------------------------------

/**
 * Try simple text search for XMP inside the raw PDF bytes.
 * If not found, scan PDF objects for metadata streams and attempt to decode them
 * (supports FlateDecode). This won't cover every exotic PDF encoding but handles
 * the common cases.
 */
function extractXMP(buffer) {
  const s = buffer.toString('latin1');
  const pktRe = /<\?xpacket[\s\S]*?\?>[\s\S]*?<\?xpacket[\s\S]*?\?>/i;
  const xmpMetaTagRe = /<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/i;

  let match = s.match(pktRe);
  if (match) return match[0];

  match = s.match(xmpMetaTagRe);
  if (match) return match[0];

  const objRe = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let m;
  while ((m = objRe.exec(s)) !== null) {
    const objText = m[3];
    if (!/Metadata|Type\s*\/Metadata|\/Subtype\s*\/XML/i.test(objText)) continue;
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/i;
    const streamMatch = objText.match(streamRe);
    if (!streamMatch) continue;
    const streamRaw = streamMatch[1];

    const dict = objText.split('stream')[0];
    const isFlate = /\/Filter\s*\/FlateDecode/i.test(dict) || /\/Filter\s*\[\s*\/FlateDecode/i.test(dict);
    try {
      if (isFlate) {
        const byteBuf = Buffer.from(streamRaw, 'latin1');
        const inflated = zlib.inflateSync(byteBuf);
        const txt = inflated.toString('utf8');
        const xm = txt.match(pktRe) || txt.match(xmpMetaTagRe);
        if (xm) return xm[0];
      } else {
        const txt = Buffer.from(streamRaw, 'latin1').toString('utf8');
        const xm = txt.match(pktRe) || txt.match(xmpMetaTagRe);
        if (xm) return xm[0];
      }
    } catch (err) {
      console.error('Decompress error for an object:', err.message);
      continue;
    }
  }

  const rawIdx = buffer.indexOf(Buffer.from('<?xpacket'));
  if (rawIdx !== -1) {
    const endTag = Buffer.from('</x:xmpmeta>');
    const endIdx = buffer.indexOf(endTag, rawIdx);
    if (endIdx !== -1) {
      const slice = buffer.slice(rawIdx, endIdx + endTag.length);
      try {
        return slice.toString('utf8');
      } catch (e) {
        return slice.toString('latin1');
      }
    }
  }

  return null;
}

// ***************************************************

function extractFonts(buffer) {
  const s = buffer.toString('latin1');
  const objRe = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;

  let m;
  const fonts = [];

  while ((m = objRe.exec(s)) !== null) {
    const objText = m[3];

    // detect font objects
    if (!/\/Type\s*\/Font/i.test(objText)) continue;

    let nameMatch = objText.match(/\/BaseFont\s*\/([^\s\/]+)/);
    let subtypeMatch = objText.match(/\/Subtype\s*\/([^\s\/]+)/);
    let embedded = /\/FontFile|\/FontFile2|\/FontFile3/.test(objText);

    let fontName = nameMatch ? nameMatch[1] : "Unknown";
    let subtype = subtypeMatch ? subtypeMatch[1] : "Unknown";

    let isSubset = fontName.includes("+");

    if (isSubset) {
      fontName = fontName.split("+")[1];
    }

    fonts.push({
      name: fontName,
      raw_name: nameMatch ? nameMatch[1] : "Unknown",
      subtype,
      embedded,
      subset: isSubset
    });
  }

  // remove duplicates
  const unique = Object.values(
    fonts.reduce((acc, f) => {
      acc[f.raw_name] = f;
      return acc;
    }, {})
  );

  return unique;
}

// -------- Extract Info Dictionary --------
function extractInfo(buffer) {
  const s = buffer.toString('latin1');

  // Step 1: find Info reference
  const trailerMatch = s.match(/\/Info\s+(\d+)\s+(\d+)\s+R/);
  if (!trailerMatch) return {};

  const objNum = trailerMatch[1];
  const genNum = trailerMatch[2];

  // Step 2: find that object
  const objRegex = new RegExp(
    `${objNum}\\s+${genNum}\\s+obj([\\s\\S]*?)endobj`
  );

  const objMatch = s.match(objRegex);
  if (!objMatch) return {};

  const obj = objMatch[1];

  // Step 3: extract fields safely
	function decodePDFString(str) {
	  if (!str) return null;

	  // detect UTF-16BE (þÿ)
	  if (str.startsWith('\xFE\xFF')) {
		const bytes = Buffer.from(str, 'binary');

		// remove BOM
		const sliced = bytes.slice(2);

		try {
		  return sliced.toString('utf16le'); // Node uses LE, but this works after swap
		} catch {
		  return str;
		}
	  }

	  // fallback
	  return Buffer.from(str, 'latin1').toString('utf8');
	}

	function getVal(key) {
	  const m = obj.match(new RegExp(`\\/${key}\\s*\\((.*?)\\)`));
	  return m ? decodePDFString(m[1]) : null;
	}
	
	function parsePDFDate(str) {
	  if (!str) return null;

	  const m = str.match(
		/D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})([+-]\d{2})'?(\d{2})'?/
	  );

	  if (!m) return str;

	  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]} ${m[7]}:${m[8]}`;
	}
	
  return {
    title: getVal('Title'),
    author: getVal('Author'),
    subject: getVal('Subject'),
    keywords: getVal('Keywords'),
    creator: getVal('Creator'),
    producer: getVal('Producer'),
    created: parsePDFDate(getVal('CreationDate')),
    modified: parsePDFDate(getVal('ModDate'))
  };
}


function extractPageWiseFonts(buffer) {
  const s = buffer.toString('latin1');

  const objRe = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;

  let m;

  const objects = {};

  // store all objects
  while ((m = objRe.exec(s)) !== null) {
    const key = `${m[1]} ${m[2]}`;
    objects[key] = m[3];
  }

  const pages = [];

  // find page objects
  Object.entries(objects).forEach(([key, objText]) => {
    if (!/\/Type\s*\/Page\b/.test(objText)) return;

    const pageFonts = new Set();

    // find Resources reference
    const resMatch = objText.match(/\/Resources\s+(\d+)\s+(\d+)\s+R/);

    if (resMatch) {
      const resKey = `${resMatch[1]} ${resMatch[2]}`;
      const resObj = objects[resKey];

      if (resObj) {
        // find Font dictionary
        const fontMatch = resObj.match(/\/Font\s*<<([\s\S]*?)>>/);

        if (fontMatch) {
          const fontDict = fontMatch[1];

          // find font references inside
          const fontRefs = fontDict.match(/\/\w+\s+(\d+)\s+(\d+)\s+R/g);

          if (fontRefs) {
            fontRefs.forEach(ref => {
              const refMatch = ref.match(/(\d+)\s+(\d+)\s+R/);
              if (!refMatch) return;

              const fontKey = `${refMatch[1]} ${refMatch[2]}`;
              const fontObj = objects[fontKey];

              if (fontObj) {
                const nameMatch = fontObj.match(/\/BaseFont\s*\/([^\s\/]+)/);

                if (nameMatch) {
                  let name = nameMatch[1];

                  if (name.includes('+')) {
                    name = name.split('+')[1];
                  }

                  pageFonts.add(name);
                }
              }
            });
          }
        }
      }
    }

    pages.push({
      page: pages.length + 1,
      fonts: Array.from(pageFonts)
    });
  });

  return pages;
}

function extractPDFVersion(buffer) {
  const header = buffer.slice(0, 20).toString('latin1');
  const m = header.match(/%PDF-(\d\.\d)/);
  return m ? m[1] : null;
}

// -------- Extract Lang --------
function extractLang(buffer) {
  const s = buffer.toString('latin1');
  const m = s.match(/\/Lang\s*\((.*?)\)/);
  return m ? m[1] : null;
}

// -------- Extract Page Count --------
function extractPageCount(buffer) {
  const s = buffer.toString('latin1');
  const m = s.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// -------- Tagged PDF --------
function isTaggedPDF(buffer) {
  const s = buffer.toString('latin1');
  return /\/MarkInfo\s*<<[\s\S]*?\/Marked\s+true/.test(s);
}


// ROUTES

app.post('/report', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;

  try {
    const buffer = fs.readFileSync(filePath);

    const xmp = extractXMP(buffer);
    const fonts = extractFonts(buffer);
    const info = extractInfo(buffer);
    const lang = extractLang(buffer);
    const pages = extractPageCount(buffer);
    const tagged = isTaggedPDF(buffer);
	const version = extractPDFVersion(buffer);
	const pageFonts = extractPageWiseFonts(buffer);

    const report = {
	  version,
      info,
      lang,
      pages,
      tagged,
      fonts,
      page_fonts: pageFonts,
      has_xmp: !!xmp
    };

    const outName =
      path.basename(req.file.originalname, path.extname(req.file.originalname)) +
      '_report.json';

    res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
    res.setHeader('Content-Type', 'application/json');

    res.send(JSON.stringify(report, null, 2));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
});

app.post('/upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;
  try {
    const buffer = fs.readFileSync(filePath);
    const xmp = extractXMP(buffer);

    if (!xmp) {
      fs.unlinkSync(filePath);
      return res.status(404).json({ error: 'No XMP metadata found in this PDF.' });
    }

    const outName = path.basename(req.file.originalname, path.extname(req.file.originalname)) + '_xmp.xml';
    let utf8text;
    try {
      utf8text = Buffer.from(xmp, 'latin1').toString('utf8');
    } catch (e) {
      utf8text = xmp;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.send(utf8text);
  } catch (err) {
    console.error(err);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Max allowed = 20 MB.' });
    }
    res.status(500).json({ error: 'Internal error' });
  } finally {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
});

app.post('/fonts', upload.single('pdf'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const filePath = req.file.path;

  try {
    const buffer = fs.readFileSync(filePath);
    const fonts = extractFonts(buffer);

    if (!fonts.length) {
      fs.unlinkSync(filePath);
      return res.status(404).json({ error: 'No fonts found in this PDF.' });
    }

    const outName =
      path.basename(req.file.originalname, path.extname(req.file.originalname)) +
      '_fonts.json';

    res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    res.send(JSON.stringify(fonts, null, 2));

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  } finally {
    try { fs.unlinkSync(filePath); } catch (e) {}
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
