
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import { createWorker } from 'tesseract.js'

GlobalWorkerOptions.workerSrc = import('pdfjs-dist/build/pdf.worker.min.mjs');

const desiredWidth = 1000;
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const imageContainer = document.querySelector('.image-container');
const fullDocumentTextarea = document.getElementById('fullDocument');
const fullDocumentSection = document.getElementById('fullDocumentSection');

let fileSelectionAllowed = true;



function showFullDocument() {
  // Only shows if there are multiple populated textareas
  const populatedTextareas = Array.from(
    document.querySelectorAll('.image-container textarea')
  ).filter(ta => ta.value.trim().length);
  if (populatedTextareas.length > 1) {
    fullDocumentTextarea.value = populatedTextareas.map(ta => ta.value.trim()).join("\n\n");
    fullDocumentSection.style.display = 'block';
  } else {
    fullDocumentTextarea.value = '';
    fullDocumentSection.style.display = 'none';
  }
}

function setTextarea(ta, text) {
  ta.value = text.trim();
  // Set textarea height to fit content
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 5) + 'px';
}

dropzone.addEventListener('dragover', handleDragOver);
dropzone.addEventListener('dragleave', handleDragLeave);
dropzone.addEventListener('drop', handleDrop);
dropzone.addEventListener('click', handleClick);

async function handleDragOver(event) {
  event.preventDefault();
  if (fileSelectionAllowed) {
    dropzone.classList.add('drag-over');
  }
}

async function handleDragLeave(event) {
  event.preventDefault();
  if (fileSelectionAllowed) {
    dropzone.classList.remove('drag-over');
  }
}

async function handleDrop(event) {
  event.preventDefault();
  if (fileSelectionAllowed) {
    dropzone.classList.remove('drag-over');
    const file = event.dataTransfer.files[0];
    fileInput.files = event.dataTransfer.files;
    void processFile(file);
  }
}

async function handleClick() {
  if (fileSelectionAllowed) {
    fileInput.click();
  }
}

fileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  void processFile(file);
});

async function processFile(file) {
  const worker = await createWorker("eng");
  fullDocumentTextarea.value = '';
  fullDocumentSection.style.display = 'none';
  imageContainer.innerHTML = '';
  const originalText = dropzone.innerText;
  dropzone.innerText = 'Processing file...';
  dropzone.classList.add('disabled');
  fileSelectionAllowed = false;

  if (file.type === 'application/pdf') {
    const { numPages, imageIterator } = await convertPDFToImages(file);
    let done = 0;
    dropzone.innerText = `Processing ${numPages} page${numPages > 1 ? 's' : ''}`;
    for await (const { imageURL } of imageIterator) {
      const ta = await displayImage(imageURL);
      const { text } = await ocrImage(worker, imageURL);
      setTextarea(ta, text);
      showFullDocument();
      done += 1;
      dropzone.innerText = `Done ${done} of ${numPages}`;
    }
  } else {
    const imageURL = URL.createObjectURL(file);
    const ta = await displayImage(imageURL);
    const { text } = await ocrImage(worker, imageURL);
    setTextarea(ta, text);
    showFullDocument();
  }

  await worker.terminate();
  dropzone.innerText = originalText;
  dropzone.classList.remove('disabled');
  fileSelectionAllowed = true;
}

async function displayImage(imageURL) {
  const imgElement = document.createElement('img');
  imgElement.src = imageURL;
  imageContainer.appendChild(imgElement);

  const altTextarea = document.createElement('textarea');
  altTextarea.classList.add('textarea-alt');
  altTextarea.placeholder = 'OCR in progress...';
  imageContainer.appendChild(altTextarea);

  return altTextarea;
}

document.addEventListener('paste', (event) => {
  const items = (event.clipboardData || event.originalEvent.clipboardData).items;
  const images = Array.from(items).filter(item => item.type.indexOf('image') !== -1);
  if (images.length) {
    void processFile(images[0].getAsFile());
  }
});

async function convertPDFToImages(file) {
  const pdf = await getDocument(URL.createObjectURL(file)).promise;
  const numPages = pdf.numPages;
  async function* images() {
    for (let i = 1; i <= numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = desiredWidth;
        canvas.height = (desiredWidth / viewport.width) * viewport.height;
        const renderContext = {
          canvasContext: context,
          viewport: page.getViewport({ scale: desiredWidth / viewport.width }),
        };
        await page.render(renderContext).promise;
        const imageURL = canvas.toDataURL('image/jpeg', 0.8);
        yield { imageURL };
      } catch (error) {
        console.error(`Error rendering page ${i}:`, error);
      }
    }
  }
  return { numPages: numPages, imageIterator: images() };
}

async function ocrImage(worker, imageUrl) {
  const {
    data: { text },
  } = await worker.recognize(imageUrl);
  return { text };
}
