const dropArea = document.getElementById('drop-area');
const fileElem = document.getElementById('fileElem');
const status = document.getElementById('status');
const meta = document.getElementById('meta');
const fileInfo = document.getElementById('file-info');

const xmpBtn = document.getElementById('xmpBtn');
const fontsBtn = document.getElementById('fontsBtn');
const reportBtn = document.getElementById('reportBtn');

let chosenFile = null;

// -------------------- Drag & Drop --------------------
function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

['dragenter','dragover','dragleave','drop'].forEach(evt => {
  dropArea.addEventListener(evt, preventDefaults, false);
});

dropArea.addEventListener('dragenter', () => dropArea.classList.add('over'));
dropArea.addEventListener('dragleave', () => dropArea.classList.remove('over'));
dropArea.addEventListener('drop', handleDrop);
dropArea.addEventListener('click', () => fileElem.click());

fileElem.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    selectFile(e.target.files[0]);
  }
});

function handleDrop(e) {
  const files = e.dataTransfer.files;
  if (files.length) selectFile(files[0]);
}

// -------------------- File Selection --------------------
function selectFile(file) {
  if (file.type !== 'application/pdf') {
    status.textContent = 'Please select a PDF.';
    return;
  }

  if (file.size > 20 * 1024 * 1024) {
    status.textContent = 'File too large. Max 20 MB.';
    return;
  }

  chosenFile = file;

  fileInfo.textContent =
    `${file.name} — ${(file.size / 1024 / 1024).toFixed(2)} MB`;

  meta.classList.remove('hidden');
  status.textContent = '';

  // enable buttons
  xmpBtn.disabled = false;
  fontsBtn.disabled = false;
  reportBtn.disabled = false;
}

// -------------------- Button Actions --------------------
xmpBtn.addEventListener('click', () => {
  if (!chosenFile) return;
  uploadFile('/upload', 'xmp');
});

fontsBtn.addEventListener('click', () => {
  if (!chosenFile) return;
  uploadFile('/fonts', 'fonts');
});
reportBtn.addEventListener('click', () => {
  if (!chosenFile) return;
  uploadFile('/report', 'report');
});

// -------------------- Upload Logic --------------------
async function uploadFile(endpoint, type) {
  status.textContent = 'Processing...';

  const form = new FormData();
  form.append('pdf', chosenFile);

  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      body: form
    });

    if (!resp.ok) {
      const json = await resp.json().catch(() => null);
      status.textContent = json?.error || 'Failed';
      return;
    }

    // filename from server	
	let filename = 'output';
	if (type === 'xmp') filename = 'metadata.xml';
	else if (type === 'fonts') filename = 'fonts.json';
	else if (type === 'report') filename = 'report.json';
	
    const cd = resp.headers.get('Content-Disposition') || '';
    const match = cd.match(/filename="(.+)"/);
    if (match) filename = match[1];

    const blob = await resp.blob();

    // trigger download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);

    status.textContent = 'Download started ✅';

  } catch (err) {
    console.error(err);
    status.textContent = 'Network or server error ❌';
  }
}