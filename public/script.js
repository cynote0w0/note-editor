const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const saveBtn = document.getElementById('save-btn');
const statusText = document.getElementById('status-text');
const titleInput = document.getElementById('title-input');
const filenameInput = document.getElementById('filename-input');
const updateSidebarCheckbox = document.getElementById('update-sidebar-checkbox');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');
const fileList = document.getElementById('file-list');
const newFileBtn = document.getElementById('new-file-btn');

let isUnsaved = false;
let currentLoadedFile = null;

// Initialize Editor with some content
const initialContent = `# Welcome to Markdown Hub

Enjoy editing with real-time preview and one-click GitHub sync.

## Features

- **Real-time preview**
- *Syntax highlighting*
- \`Code snippets\` support
- Tables support
- Direct push to **GitHub**

\`\`\`javascript
// Write some beautiful code
const greet = () => {
  console.log('Hello, World!');
};
\`\`\`

| Feature | Status |
|---|---|
| Auto-save | ❌ (Manual Save) |
| GitHub Push | ✅ |

> This editor uses Marked.js and a Node.js backend to push directly to your repository.
`;

editor.value = initialContent;
updatePreview();
fetchFiles();

// Event Listeners
newFileBtn.addEventListener('click', () => {
  if (isUnsaved) {
    if (!confirm('You have unsaved changes. Discard them?')) return;
  }
  editor.value = '';
  titleInput.value = '';
  filenameInput.value = '';
  currentLoadedFile = null;
  isUnsaved = false;
  statusText.textContent = 'New File';
  statusText.style.color = 'var(--text-muted)';
  updatePreview();
  fetchFiles(); // Re-render list to clear active state
});
editor.addEventListener('input', () => {
  updatePreview();
  if (!isUnsaved) {
    isUnsaved = true;
    statusText.textContent = 'Unsaved changes';
    statusText.style.color = '#eab308'; // Warning yellow
  }
});

editor.addEventListener('keydown', (e) => {
  // Support tab key indentation
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + "  " + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
    updatePreview();
    isUnsaved = true;
    statusText.textContent = 'Unsaved changes';
    statusText.style.color = '#eab308';
  }
});

saveBtn.addEventListener('click', saveToGitHub);

// Keyboard shortcut (Ctrl+S / Cmd+S)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveToGitHub();
  }
});

// Functions
function updatePreview() {
  try {
    const markdownText = editor.value;
    // marked.parse handles marked v4+
    preview.innerHTML = (typeof marked.parse === 'function') ? marked.parse(markdownText) : marked(markdownText);
    
    // Apply highlight.js manually
    if (typeof hljs !== 'undefined') {
      preview.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  } catch (err) {
    console.error("Preview rendering error:", err);
  }
}

async function saveToGitHub() {
  const content = editor.value;
  const filename = filenameInput.value.trim();
  const title = titleInput.value.trim();
  const updateSidebar = updateSidebarCheckbox.checked;

  if (!filename) {
    showToast('Filename cannot be empty', 'error');
    return;
  }
  
  // Set UI to loading state
  saveBtn.classList.add('saving');
  saveBtn.innerHTML = `
    <svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
    Saving...
  `;

  try {
    const response = await fetch('/api/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content, filename, title, updateSidebar })
    });

    const result = await response.json();

    if (response.ok) {
      showToast(result.message || 'Saved successfully to GitHub!', 'success');
      isUnsaved = false;
      statusText.textContent = 'All changes saved';
      statusText.style.color = 'var(--text-muted)';
    } else {
      showToast(result.error || 'Failed to save', 'error');
    }
  } catch (error) {
    showToast('Network error, could not save', 'error');
  } finally {
    // Reset button
    saveBtn.classList.remove('saving');
    saveBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
      Save to GitHub
    `;
    fetchFiles(); // Refresh sidebar after saving
  }
}

async function fetchFiles() {
  try {
    const res = await fetch('/api/files');
    const data = await res.json();
    renderFileList(data.files || []);
  } catch (err) {
    console.error('Failed to fetch files:', err);
    fileList.innerHTML = '<div class="file-list-loader" style="color:var(--error)">Failed to load files</div>';
  }
}

function renderFileList(files) {
  if (files.length === 0) {
    fileList.innerHTML = '<div class="file-list-loader">No markdown files found</div>';
    return;
  }
  
  fileList.innerHTML = '';
  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-item';
    if (file.name === currentLoadedFile) item.classList.add('active');
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-item-name';
    nameSpan.textContent = file.name;
    nameSpan.title = file.name;
    
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.title = 'Delete File';
    delBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFile(file.name);
    });
    
    item.addEventListener('click', () => {
      loadFile(file.name);
    });
    
    item.appendChild(nameSpan);
    item.appendChild(delBtn);
    fileList.appendChild(item);
  });
}

async function loadFile(filename) {
  if (isUnsaved) {
    if (!confirm('You have unsaved changes. Discard them?')) return;
  }
  
  fileList.innerHTML = '<div class="file-list-loader">Loading...</div>';
  
  try {
    const res = await fetch(`/api/file?filename=${encodeURIComponent(filename)}`);
    const data = await res.json();
    
    if (res.ok) {
      editor.value = data.content || '';
      filenameInput.value = filename;
      currentLoadedFile = filename;
      
      const firstLine = editor.value.split('\\n')[0];
      if (firstLine && firstLine.startsWith('# ')) {
        titleInput.value = firstLine.replace(/^#\s*/, '').trim();
      } else {
        titleInput.value = '';
      }
      
      isUnsaved = false;
      statusText.textContent = 'All changes saved';
      statusText.style.color = 'var(--text-muted)';
      updatePreview();
      fetchFiles();
    } else {
      showToast(data.error || 'Failed to load file', 'error');
      fetchFiles();
    }
  } catch (err) {
    console.error('Failed to load file:', err);
    showToast('Network error, could not load file', 'error');
    fetchFiles();
  }
}

async function deleteFile(filename) {
  if (!confirm(`Are you sure you want to delete ${filename}? This cannot be undone and it will be removed from _sidebar.md as well.`)) {
    return;
  }
  
  try {
    const res = await fetch(`/api/file?filename=${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    
    if (res.ok) {
      showToast(`${filename} deleted successfully`, 'success');
      if (currentLoadedFile === filename) {
        editor.value = '';
        titleInput.value = '';
        filenameInput.value = '';
        currentLoadedFile = null;
        updatePreview();
      }
      fetchFiles();
    } else {
      showToast(data.error || 'Failed to delete file', 'error');
    }
  } catch (err) {
    console.error('Delete error:', err);
    showToast('Network error on deletion', 'error');
  }
}

function showToast(message, type) {
  toastMessage.textContent = message;
  toast.className = `toast show ${type}`;
  
  setTimeout(() => {
    toast.className = 'toast hidden';
  }, 4000);
}

// Add keyframes for spinner dynamically
const style = document.createElement('style');
style.textContent = `
  @keyframes spin { 100% { transform: rotate(360deg); } }
`;
document.head.appendChild(style);
