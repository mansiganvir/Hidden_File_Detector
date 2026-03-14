document.addEventListener('DOMContentLoaded', () => {
    const scanBtn = document.getElementById('scan-btn');
    const pathInput = document.getElementById('path-input');
    const resultsTable = document.getElementById('results-table');
    const resultsBody = document.getElementById('results-body');
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('error-message');
    const showHiddenOnlyCb = document.getElementById('show-hidden-only');
    const pathNavigation = document.getElementById('path-navigation');
    
    // Modal elements
    const modal = document.getElementById('details-modal');
    const closeBtn = document.querySelector('.close-btn');
    const modalBody = document.getElementById('modal-body');

    let currentItems = [];
    let currentPathStr = '';

    // Initialize with default path (C:\ or / depending on OS)
    scanDirectory('.');

    scanBtn.addEventListener('click', () => {
        scanDirectory(pathInput.value);
    });

    pathInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            scanDirectory(pathInput.value);
        }
    });

    showHiddenOnlyCb.addEventListener('change', () => {
        renderTable(currentItems);
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.add('hidden');
        }
    });

    async function scanDirectory(path) {
        showLoading();
        
        try {
            const response = await fetch('/api/explore', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ path: path })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to scan directory');
            }

            currentItems = data.items;
            currentPathStr = data.current_path;
            pathInput.value = currentPathStr;
            
            updatePathNavigation(data.current_path);
            renderTable(currentItems);
            hideLoading();
            
        } catch (error) {
            showError(error.message);
        }
    }

    function renderTable(items) {
        resultsBody.innerHTML = '';
        const showHiddenOnly = showHiddenOnlyCb.checked;
        
        const filteredItems = showHiddenOnly 
            ? items.filter(item => item.is_hidden)
            : items;

        if (filteredItems.length === 0) {
            resultsBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">
                        No ${showHiddenOnly ? 'hidden ' : ''}items found in this directory.
                    </td>
                </tr>
            `;
            resultsTable.classList.remove('hidden');
            return;
        }

        filteredItems.forEach(item => {
            const tr = document.createElement('tr');
            
            if (item.error) {
                tr.className = 'error-row';
                tr.innerHTML = `
                    <td>
                        <div class="item-name">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            <span>${item.name || item.path}</span>
                        </div>
                    </td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>-</td>
                    <td>Permission Denied</td>
                `;
                resultsBody.appendChild(tr);
                return;
            }

            // Icon
            const iconClass = item.is_dir ? 'fa-solid fa-folder' : 'fa-solid fa-file';
            
            // Format size
            const sizeStr = item.is_dir ? '--' : formatBytes(item.size);
            
            // Format date
            const modDate = new Date(item.modified).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute:'2-digit'
            });

            // Status Badge
            const statusHtml = item.is_hidden 
                ? '<span class="status-badge status-hidden"><i class="fa-solid fa-eye-slash"></i> Hidden</span>'
                : '<span class="status-badge status-normal"><i class="fa-regular fa-eye"></i> Visible</span>';

            tr.innerHTML = `
                <td>
                    <div class="item-name ${item.is_dir ? 'cursor-pointer' : ''}" style="cursor: ${item.is_dir ? 'pointer' : 'default'}">
                        <i class="${iconClass}"></i>
                        <span>${item.name}</span>
                    </div>
                </td>
                <td>${statusHtml}</td>
                <td>${item.is_dir ? 'Directory' : 'File'}</td>
                <td>${sizeStr}</td>
                <td>${modDate}</td>
                <td>
                    <button class="action-btn" data-path="${item.path.replace(/\\/g, '\\\\')}">Details</button>
                </td>
            `;

            // If directory, clicking the name navigates
            if (item.is_dir) {
                const nameCell = tr.querySelector('.item-name');
                nameCell.addEventListener('click', () => {
                    scanDirectory(item.path);
                });
            }

            // Click details
            const detailsBtn = tr.querySelector('.action-btn');
            detailsBtn.addEventListener('click', () => {
                showDetails(item);
            });

            resultsBody.appendChild(tr);
        });

        resultsTable.classList.remove('hidden');
    }

    function showDetails(item) {
        const modDate = new Date(item.modified).toLocaleString();
        const createDate = new Date(item.created).toLocaleString();
        
        modalBody.innerHTML = `
            <div class="details-grid">
                <div class="detail-label">Name:</div>
                <div class="detail-value"><strong>${item.name}</strong></div>
                
                <div class="detail-label">Full Path:</div>
                <div class="detail-value" style="font-family: monospace; background: rgba(0,0,0,0.2); padding: 4px; border-radius: 4px;">${item.path}</div>
                
                <div class="detail-label">Type:</div>
                <div class="detail-value">${item.is_dir ? 'Directory' : 'File'}</div>
                
                <div class="detail-label">Status:</div>
                <div class="detail-value">${item.is_hidden ? '<span style="color:var(--hidden-color)"><i class="fa-solid fa-eye-slash"></i> Hidden</span>' : 'Visible'}</div>
                
                <div class="detail-label">Size:</div>
                <div class="detail-value">${formatBytes(item.size)} (${item.size.toLocaleString()} bytes)</div>
                
                <div class="detail-label">Created:</div>
                <div class="detail-value">${createDate}</div>
                
                <div class="detail-label">Modified:</div>
                <div class="detail-value">${modDate}</div>
            </div>
        `;
        
        modal.classList.remove('hidden');
    }

    function updatePathNavigation(fullPath) {
        pathNavigation.innerHTML = '';
        
        // Handle Windows paths (C:\foo\bar) and Unix paths (/foo/bar)
        const isWindows = fullPath.includes('\\') || /^[A-Z]:/i.test(fullPath);
        const sep = isWindows ? '\\' : '/';
        
        let parts = fullPath.split(sep).filter(p => p !== '');
        
        if (isWindows && /^([A-Z]:)$/i.test(parts[0])) {
            parts[0] += '\\'; // Make 'C:' -> 'C:\'
        } else if (!isWindows && fullPath.startsWith('/')) {
            parts.unshift('/'); // Root
        }

        let currentBuildPath = '';

        parts.forEach((part, index) => {
            if (part === '/' && index === 0) {
                currentBuildPath = '/';
                part = 'Root';
            } else {
                if (currentBuildPath === '' || currentBuildPath === '/') {
                    currentBuildPath += part;
                } else if (currentBuildPath.endsWith(sep)) {
                    currentBuildPath += part;
                } else {
                    currentBuildPath += sep + part;
                }
            }

            const isLast = index === parts.length - 1;
            
            const span = document.createElement('span');
            span.textContent = part;
            span.className = isLast ? 'breadcrumb' : 'breadcrumb';
            if (isLast) {
                span.style.fontWeight = 'bold';
                span.style.color = 'var(--text-color)';
            }
            
            const pathForClosure = currentBuildPath;
            span.addEventListener('click', () => {
                if (!isLast) {
                    scanDirectory(pathForClosure);
                }
            });

            pathNavigation.appendChild(span);

            if (!isLast) {
                const sepSpan = document.createElement('span');
                sepSpan.textContent = isWindows ? '\\' : '/';
                sepSpan.className = 'breadcrumb-separator';
                pathNavigation.appendChild(sepSpan);
            }
        });
    }

    function formatBytes(bytes, decimals = 2) {
        if (!+bytes) return '0 Bytes';

        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    }

    function showLoading() {
        loading.classList.remove('hidden');
        resultsTable.classList.add('hidden');
        errorMessage.classList.add('hidden');
    }

    function hideLoading() {
        loading.classList.add('hidden');
    }

    function showError(msg) {
        hideLoading();
        errorMessage.textContent = msg;
        errorMessage.classList.remove('hidden');
        resultsTable.classList.add('hidden');
    }
});
