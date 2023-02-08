class DescribeView extends HTMLElement {
    constructor(ds) {
        super();
        // -- where ds is Map type
        if (ds) {
            this.setDataSource(ds);
        }
    }

    connectedCallback() {
        // browser calls this method when the element is added to the document
        // (can be called many times if an element is repeatedly added/removed)
    }

    disconnectedCallback() {
        // browser calls this method when the element is removed from the document
        // (can be called many times if an element is repeatedly added/removed)
    }

    static get observedAttributes() {
        return [/* array of attribute names to monitor for changes */];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        // called when one of attributes listed above is modified
    }

    adoptedCallback() {
        // called when the element is moved to a new document
        // (happens in document.adoptNode, very rarely used)
    }

    // there can be other element methods and properties

    setDataSource(ds) {
        this.ds = ds;
        this.refreshChild();
    }

    refreshChild() {
        const me = this;
        this.innerHTML = ''; // -- clear
        const table = document.createElement('table');
        const tbody = document.createElement('tbody');

        this.ds.forEach((v, k) => {
            const tr = document.createElement('tr');
            const td1 = document.createElement('td');
            const td2 = document.createElement('td');
            const td3 = document.createElement('td');

            td1.textContent = k;
            td2.textContent = `${v.type}`;
            td3.textContent = v.v;

            if (8 < v.size) {
                // td2.textContent = `${v.type} ${v.size}`
                td3.style.wordBreak = 'break-all';
            }

            tr.addEventListener('mouseover', (e) => {
                me.eventHexSelect(k);
            });

            tr.appendChild(td1);
            tr.appendChild(td2);
            tr.appendChild(td3);
            tbody.appendChild(tr);
        });

        table.style.fontFamily = 'monospace';
        table.appendChild(tbody);
        this.appendChild(table);
    }

    eventHexSelect(key) {
        let start = 0;
        let size = 0;

        for (const [k, v] of this.ds.entries()) {
            size = v.size;

            if (key === k) {
                break;
            }
            start = start + v.size;
        }

        if (this.onMouseOverListener) {
            this.onMouseOverListener(start, size);
        }
    }

    setOnMouseOverListener(fn) {
        this.onMouseOverListener = fn;
    }

}

customElements.define('describe-view', DescribeView);
