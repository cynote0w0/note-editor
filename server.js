require('dotenv').config();
const express = require('express');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Octokit
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

app.post('/api/save', async (req, res) => {
  const { content, filename, title, updateSidebar } = req.body;
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const basePath = process.env.FILE_PATH || '';

  if (content === undefined) {
    return res.status(400).json({ error: 'Content is required' });
  }

  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  // Combine base path from .env with the user-provided filename
  const sanitizedBasePath = basePath.replace(/\/+$/, '');
  const filePath = sanitizedBasePath ? `${sanitizedBasePath}/${filename}` : filename;

  if (!owner || !repo || !process.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN === 'your_github_personal_access_token_here') {
    return res.status(500).json({ error: 'GitHub credentials not configured in .env' });
  }

  try {
    // 1. Get the current file SHA to update it (if it exists)
    let sha = undefined;
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
      });
      // If it's a file, data is an object and has a sha
      sha = Array.isArray(data) ? undefined : data.sha;
    } catch (err) {
      if (err.status !== 404) {
        throw err;
      }
      // If 404, file doesn't exist yet, we can create it (sha remains undefined)
    }

    // 2. Create or update the file
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message: `Auto-save from Markdown Editor: ${new Date().toISOString()}`,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      sha,
    });

    let extraMessage = 'Saved successfully to GitHub';

    // 3. Auto-update _sidebar.md if requested
    if (updateSidebar) {
      try {
        const sidebarPath = '_sidebar.md'; 
        let sidebarSha = undefined;
        let sidebarContent = '';
        
        // Fetch current _sidebar.md
        try {
          const { data: sidebarData } = await octokit.repos.getContent({
            owner,
            repo,
            path: sidebarPath,
          });
          
          if (!Array.isArray(sidebarData)) {
            sidebarSha = sidebarData.sha;
            sidebarContent = Buffer.from(sidebarData.content, 'base64').toString('utf-8');
          }
        } catch (sidebarErr) {
          if (sidebarErr.status !== 404) throw sidebarErr;
          // If 404, we'll create it
        }

        // Format the link for Docsify route (e.g. docs/foo.md -> /docs/foo.md)
        const docsifyLinkPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
        // The display title is either what user typed, or the raw filename
        const displayTitle = title || filename;
        const newLink = `  - [${displayTitle}](${docsifyLinkPath})`;
        
        // Append only if it doesn't already exist
        if (!sidebarContent.includes(docsifyLinkPath)) {
          // ensure there's a newline before appending
          const updatedSidebarContent = sidebarContent.endsWith('\n') || sidebarContent === ''
            ? `${sidebarContent}${newLink}\n` 
            : `${sidebarContent}\n${newLink}\n`;

          await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: sidebarPath,
            message: `Auto-update _sidebar.md to include ${filename}`,
            content: Buffer.from(updatedSidebarContent, 'utf-8').toString('base64'),
            sha: sidebarSha,
          });
          
          extraMessage = 'Saved file and updated _sidebar.md successfully';
        }
      } catch (sidebarUpdateError) {
        console.error('Failed to update _sidebar.md:', sidebarUpdateError);
        extraMessage = 'Saved file, but failed to update _sidebar.md. Check logs.';
      }
    }

    res.json({ success: true, message: extraMessage });
  } catch (error) {
    console.error('GitHub Save Error:', error);
    res.status(500).json({ error: 'Failed to save to GitHub. Check credentials and repository settings.' });
  }
});

// Get list of files
app.get('/api/files', async (req, res) => {
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const basePath = process.env.FILE_PATH || '';

  if (!owner || !repo || !process.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN === 'your_github_personal_access_token_here') {
    return res.status(500).json({ error: 'GitHub credentials not configured in .env' });
  }

  try {
    const sanitizedBasePath = basePath.replace(/\/+$/, '');
    
    // Using simple approach: just fetch basePath directory
    // If basePath is empty, it fetches root. 
    // In octokit, path for root is just ''
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: sanitizedBasePath,
    });

    if (!Array.isArray(data)) {
      return res.json({ files: [] }); // not a directory
    }

    const mdFiles = data
      .filter(file => file.type === 'file' && file.name.endsWith('.md'))
      .map(file => ({
        name: file.name,
        path: file.path,
        sha: file.sha
      }));

    res.json({ files: mdFiles });
  } catch (error) {
    if (error.status === 404) {
      return res.json({ files: [] }); // path doesn't exist yet, return empty
    }
    console.error('Fetch files error:', error);
    res.status(500).json({ error: 'Failed to fetch files from GitHub' });
  }
});

// Get single file content
app.get('/api/file', async (req, res) => {
  const { filename } = req.query;
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const basePath = process.env.FILE_PATH || '';

  if (!filename) return res.status(400).json({ error: 'Filename is required' });

  const sanitizedBasePath = basePath.replace(/\/+$/, '');
  const filePath = sanitizedBasePath ? `${sanitizedBasePath}/${filename}` : filename;

  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
    });

    if (Array.isArray(data) || !data.content) {
      return res.status(400).json({ error: 'Not a valid file' });
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    res.json({ content, sha: data.sha });
  } catch (error) {
    console.error('Fetch file error:', error);
    res.status(500).json({ error: 'Failed to fetch file content' });
  }
});

// Delete file
app.delete('/api/file', async (req, res) => {
  const _filename = req.query.filename || req.body.filename;
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const basePath = process.env.FILE_PATH || '';

  if (!_filename) return res.status(400).json({ error: 'Filename is required' });

  const sanitizedBasePath = basePath.replace(/\/+$/, '');
  const filePath = sanitizedBasePath ? `${sanitizedBasePath}/${_filename}` : _filename;

  try {
    let fileSha;
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
      });
      if (Array.isArray(data)) throw new Error('Target is a directory');
      fileSha = data.sha;
    } catch (err) {
      if (err.status === 404) return res.status(404).json({ error: 'File not found' });
      throw err;
    }

    // Delete the file
    await octokit.repos.deleteFile({
      owner,
      repo,
      path: filePath,
      message: `Delete file via CMS: ${_filename}`,
      sha: fileSha
    });

    // Update _sidebar.md
    try {
      const sidebarPath = '_sidebar.md'; 
      const { data: sidebarData } = await octokit.repos.getContent({
        owner,
        repo,
        path: sidebarPath,
      });

      if (!Array.isArray(sidebarData)) {
        let sidebarContent = Buffer.from(sidebarData.content, 'base64').toString('utf-8');
        const docsifyLinkPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
        
        // Remove line containing the link
        const lines = sidebarContent.split('\n');
        const updatedLines = lines.filter(line => !line.includes(`(${docsifyLinkPath})`));
        const updatedSidebarContent = updatedLines.join('\n');

        if (sidebarContent.length !== updatedSidebarContent.length) {
          await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path: sidebarPath,
            message: `Remove ${_filename} from _sidebar.md`,
            content: Buffer.from(updatedSidebarContent, 'utf-8').toString('base64'),
            sha: sidebarData.sha,
          });
        }
      }
    } catch (sidebarErr) {
      console.error('Failed to update _sidebar.md on delete:', sidebarErr);
    }

    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
