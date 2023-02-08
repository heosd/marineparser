class HexView extends HTMLElement {
    constructor(ds) {
        super();
        this.lastSelected = [];
        if(ds) {
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
        this.innerHTML = '';

        if(!this.ds || 0 === this.ds.byteLength) {
            return;
        }

        // -- flex 1 : 2
        this.style.display = 'flex';

        // -- left
        const divLeft = document.createElement('div');
        divLeft.id = 'divHex';
        divLeft.style.flex = 3;
        divLeft.style.display = 'grid';
        divLeft.style.gridTemplateColumns = 'repeat(16, 1fr)';

        // -- right
        const divRight = document.createElement('div');
        divRight.id = 'divAscii';
        divRight.style.flex = 1;
        divRight.style.display = 'grid';
        divRight.style.gridTemplateColumns = 'repeat(16, 1fr)';


        for(let i = 0; i < this.ds.byteLength; i++) {
            const byte = this.ds.getUint8(i);

            // -- left
            const span1 = document.createElement('span');
            span1.style.fontFamily = 'monospace';
            span1.textContent = byte.toString(16).toUpperCase().padStart(2, '0');
            divLeft.appendChild(span1);

            // -- right
            const span2 = document.createElement('span');
            span2.style.fontFamily = 'monospace';
            span2.textContent = String.fromCharCode(byte);
            divRight.appendChild(span2);
        }

        this.appendChild(divLeft);
        this.appendChild(divRight);
    }

    select(from, to) {
        const COLOR = 'orangered'
        this.lastSelected.forEach(d => d.style.color = '');
        this.lastSelected = [];

        const saveThis = [];

        const divLeft = document.getElementById('divHex');
        const divRight = document.getElementById('divAscii');

        for(let i = from; i < to; i++) {
            const spanLeft = divLeft.childNodes[i];
            const spanRight = divRight.childNodes[i];

            // spanLeft.style.backgroundColor = COLOR;
            // spanRight.style.backgroundColor = COLOR;
            spanLeft.style.color = COLOR;
            spanRight.style.color = COLOR;

            saveThis.push(spanLeft, spanRight);
        }

        this.lastSelected = saveThis;

        return this.lastSelected;
    }
}

customElements.define('hex-view', HexView);