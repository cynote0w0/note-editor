require('dotenv').config();
const express = require('express');
const { Octokit } = require('@octokit/rest');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Session configuration (2-hour expiry)
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 2 * 60 * 60 * 1000 // 2 hours in milliseconds
  }
}));

// Serve login page directly (no auth required)
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Auth middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// Login route (no auth required)
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD not configured in .env' });
  }

  if (password === adminPassword) {
    req.session.authenticated = true;
    return res.json({ success: true });
  } else {
    return res.status(401).json({ error: '密码错误' });
  }
});

// Logout route
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Check auth status
app.get('/api/check-auth', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.json({ authenticated: true });
  }
  return res.status(401).json({ authenticated: false });
});

app.use(express.static(path.join(__dirname, 'public')));

// Initialize Octokit
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});


// Helper function to update _sidebar.md linkage
// If isDelete is true, it only removes the link for the file.
// If isDelete is false, it removes the old link and re-inserts it under the appropriate path hierarchy.
async function refreshSidebarLink(octokit, owner, repo, filename, title, isDelete = false) {
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
      if (isDelete) return; // if deleting and no sidebar exists, nothing to do
    }

    const basePath = process.env.FILE_PATH || '';
    const sanitizedBasePath = basePath.replace(/\/+$/, '');
    const filePath = sanitizedBasePath ? `${sanitizedBasePath}/${filename}` : filename;
    
    const docsifyLinkPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
    
    // Clean up any literal '\n' bug strings that might be in the current sidebar
    sidebarContent = sidebarContent.replace(/\\n/g, '\n');
    let lines = sidebarContent.split('\n');
    
    // Remove old link if it exists anywhere
    lines = lines.filter(line => !line.includes(`(${docsifyLinkPath})`));
    
    if (!isDelete) {
      // Build the tree based on filename
      const parts = filename.split('/').filter(Boolean);
      const fileNamePart = parts.pop();
      const directories = parts;
      const displayTitle = title || fileNamePart;
      const newLink = `[${displayTitle}](${docsifyLinkPath})`;
      
      if (directories.length === 0) {
        // Root level file
        lines.push(`- ${newLink}`);
      } else {
        let currentIndent = 0;
        let searchStartIndex = 0;
        
        for (let i = 0; i < directories.length; i++) {
          const dir = directories[i];
          const expectedPrefix = ' '.repeat(currentIndent) + '- ' + dir;
          const expectedPrefixStar = ' '.repeat(currentIndent) + '* ' + dir;

          let foundLineIndex = -1;
          for (let j = searchStartIndex; j < lines.length; j++) {
            const line = lines[j];
            const matchPrefix = (line.startsWith(expectedPrefix) || line.startsWith(expectedPrefixStar)) && !line.includes('[');
            if (matchPrefix) {
              foundLineIndex = j;
              break;
            }
          }

          if (foundLineIndex !== -1) {
            // Found directory, search inside it
            searchStartIndex = foundLineIndex + 1;
            currentIndent += 2;
          } else {
            // Not found, create it
            let insertPoint = searchStartIndex;
            
            if (i > 0) {
              const parentIndent = currentIndent - 2;
              while (insertPoint < lines.length) {
                const nextLine = lines[insertPoint];
                if (nextLine.trim() === '') {
                  insertPoint++;
                  continue;
                }
                const nextIndent = nextLine.search(/\S/);
                if (nextIndent <= parentIndent && nextLine.trim().length > 0) {
                  break;
                }
                insertPoint++;
              }
            } else {
              insertPoint = lines.length;
              if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
                lines.push('');
                insertPoint++;
              }
            }
            
            for (let k = i; k < directories.length; k++) {
              const newDir = directories[k];
              lines.splice(insertPoint, 0, ' '.repeat(currentIndent) + '- ' + newDir);
              insertPoint++;
              currentIndent += 2;
            }
            searchStartIndex = insertPoint;
            break; 
          }
        }

        if (searchStartIndex < lines.length && currentIndent > 0) {
          let insertPoint = searchStartIndex;
          const parentIndent = currentIndent - 2;
          while (insertPoint < lines.length) {
            const nextLine = lines[insertPoint];
            if (nextLine.trim() === '') {
              insertPoint++;
              continue;
            }
            const nextIndent = nextLine.search(/\S/);
            if (nextIndent <= parentIndent && nextLine.trim().length > 0) {
              break;
            }
            insertPoint++;
          }
          lines.splice(insertPoint, 0, ' '.repeat(currentIndent) + '- ' + newLink);
        } else {
          lines.splice(searchStartIndex, 0, ' '.repeat(currentIndent) + '- ' + newLink);
        }
      }
    }
    
    let updatedSidebarContent = lines.join('\n');
    updatedSidebarContent = updatedSidebarContent.replace(/\n{3,}/g, '\n\n');

    if (sidebarContent.trim() !== updatedSidebarContent.trim()) {
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: sidebarPath,
        message: isDelete ? `Remove ${filename} from _sidebar.md` : `Auto-update _sidebar.md to include ${filename}`,
        content: Buffer.from(updatedSidebarContent, 'utf-8').toString('base64'),
        sha: sidebarSha,
      });
    }
  } catch (error) {
    console.error('Failed to update _sidebar.md:', error);
    throw error;
  }
}

app.post('/api/save', requireAuth, async (req, res) => {
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
        await refreshSidebarLink(octokit, owner, repo, filename, title, false);
        extraMessage = 'Saved file and updated _sidebar.md successfully';
      } catch (sidebarUpdateError) {
        extraMessage = 'Saved file, but failed to update _sidebar.md. Check logs.';
      }
    }

    res.json({ success: true, message: extraMessage });
  } catch (error) {
    console.error('GitHub Save Error:', error);
    res.status(500).json({ error: 'Failed to save to GitHub. Check credentials and repository settings.' });
  }
});

app.post('/api/move', requireAuth, async (req, res) => {
  const { oldPath, newPath, title } = req.body;
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const basePath = process.env.FILE_PATH || '';

  if (!oldPath || !newPath) {
    return res.status(400).json({ error: 'Both oldPath and newPath are required' });
  }

  if (!owner || !repo || !process.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN === 'your_github_personal_access_token_here') {
    return res.status(500).json({ error: 'GitHub credentials not configured in .env' });
  }

  const sanitizedBasePath = basePath.replace(/\/+$/, '');
  const oldFilePath = sanitizedBasePath ? `${sanitizedBasePath}/${oldPath}` : oldPath;
  const newFilePath = sanitizedBasePath ? `${sanitizedBasePath}/${newPath}` : newPath;

  try {
    // 1. Get old file content and sha
    let data;
    try {
      const result = await octokit.repos.getContent({
        owner,
        repo,
        path: oldFilePath,
      });
      data = result.data;
    } catch (err) {
      if (err.status === 404) return res.status(404).json({ error: 'File to move not found' });
      throw err;
    }

    if (Array.isArray(data)) {
      return res.status(400).json({ error: 'Cannot move a directory, only files are supported' });
    }

    const contentBase64 = data.content;
    const oldSha = data.sha;
    
    // 2. Create at new location
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: newFilePath,
      message: `Move file from ${oldPath} to ${newPath}`,
      content: contentBase64,
    });
    
    // 3. Delete old location
    await octokit.repos.deleteFile({
      owner,
      repo,
      path: oldFilePath,
      message: `Delete old file ${oldPath} after move`,
      sha: oldSha
    });
    
    // 4. Update Sidebar (remove old link, insert new link)
    try {
      await refreshSidebarLink(octokit, owner, repo, oldPath, '', true);
      await refreshSidebarLink(octokit, owner, repo, newPath, title || newPath.split('/').pop(), false);
    } catch (sidebarErr) {
      console.error('Failed to update sidebar during move:', sidebarErr);
    }
    
    res.json({ success: true, message: 'Moved successfully' });
  } catch (error) {
    console.error('Move error:', error);
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// Get list of files
app.get('/api/files', requireAuth, async (req, res) => {
  const owner = process.env.REPO_OWNER;
  const repo = process.env.REPO_NAME;
  const basePath = process.env.FILE_PATH || '';

  if (!owner || !repo || !process.env.GITHUB_TOKEN || process.env.GITHUB_TOKEN === 'your_github_personal_access_token_here') {
    return res.status(500).json({ error: 'GitHub credentials not configured in .env' });
  }

  try {
    const { data: repoData } = await octokit.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;
    
    const { data: treeData } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: defaultBranch,
      recursive: '1'
    });
    
    const sanitizedBasePath = basePath.replace(/\/+$/, '');
    const prefix = sanitizedBasePath ? `${sanitizedBasePath}/` : '';
    
    const mdFiles = treeData.tree
      .filter(item => item.type === 'blob' && item.path.endsWith('.md') && (!prefix || item.path.startsWith(prefix)))
      .map(item => {
        let relativePath = item.path;
        if (prefix && relativePath.startsWith(prefix)) {
            relativePath = relativePath.substring(prefix.length);
        }
        
        const nameParts = relativePath.split('/');
        const name = nameParts[nameParts.length - 1];

        return {
          name: name,
          path: relativePath,
          sha: item.sha
        };
      });

    res.json({ files: mdFiles });
  } catch (error) {
    if (error.status === 404 || error.status === 409) {
      return res.json({ files: [] }); 
    }
    console.error('Fetch files error:', error);
    res.status(500).json({ error: 'Failed to fetch files from GitHub' });
  }
});

// Get single file content
app.get('/api/file', requireAuth, async (req, res) => {
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
app.delete('/api/file', requireAuth, async (req, res) => {
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
      await refreshSidebarLink(octokit, owner, repo, _filename, '', true);
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
