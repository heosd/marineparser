class ListSections extends HTMLElement {
    constructor(ds) {
        super();

        this.page = 1;
        this.pageSize = 50;
        this.filter = [];

        this.basicLayout();

        if (ds) {
            this.setDataSource(ds);
        }
    }

    static CreateCheckbox(title) {
        const id = `checkbox_${Math.floor(Math.random() * 100000)}`;
        const checkbox = document.createElement('input');
        const label = document.createElement('label');

        checkbox.type = 'checkbox';
        checkbox.id = id;
        label.textContent = title;
        label.htmlFor = id;

        return [checkbox, label];
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
        return ['data-filter', 'data-page', 'data-page-size', 'data-title', 'data-value'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        let changed = false;
        if ('data-filter' === name) {
            try {
                const filter = JSON.parse(newValue);
                this.filter = filter;
                changed = true;
            } catch (e) {
            }
        } else if ('data-page' === name) {
            try {
                const page = parseInt(newValue);
                if (!isNaN(page)) {
                    this.page = page;
                    changed = true;
                }
            } catch (e) {
            }
        } else if ('data-page-size' === name) {
            const pageSize = parseInt(newValue);
            if (!isNaN(pageSize)) {
                this.pageSize = pageSize;
                changed = true;
            }
        } else if ('data-title' === name) {
            this.attrTitle = newValue;
            changed = true;
        } else if ('data-value' === name) {
            this.attrValue = newValue;
            changed = true;
        }

        if (changed) {
            this.refreshChild();
        }
    }

    adoptedCallback() {
        // called when the element is moved to a new document
        // (happens in document.adoptNode, very rarely used)
    }

    // there can be other element methods and properties

    setDataSource(ds) {
        this.ds = ds;

        this.refreshChild();
        this.refreshChildSummary();
    }

    basicLayout() {
        const me = this;

        const divHead = document.createElement('div');
        const div1 = document.createElement('div'); // summary
        const div2 = document.createElement('div'); // detail

        this.divHead = divHead;
        this.divs = [div1, div2];

        // -- head prev next
        const buttonPrev = document.createElement('button');
        const buttonNext = document.createElement('button');
        buttonPrev.addEventListener('click', (e) => me.moveToPage(e.target));
        buttonNext.addEventListener('click', (e) => me.moveToPage(e.target));
        divHead.appendChild(buttonPrev);
        divHead.appendChild(buttonNext);
        this.btnPrev = buttonPrev;
        this.btnNext = buttonNext;
        this.updatePageButtons();

        // -- head summary, detail
        const buttonSummary = document.createElement('button');
        const buttonList = document.createElement('button');
        buttonSummary.textContent = 'Summary';
        buttonList.textContent = 'List';
        divHead.appendChild(buttonSummary);
        divHead.appendChild(buttonList);
        buttonSummary.addEventListener('click', (e) => {
            me.divs[0].style.display = 'block';
            me.divs[1].style.display = 'none';
        });
        buttonList.addEventListener('click', (e) => {
            me.divs[0].style.display = 'none';
            me.divs[1].style.display = 'block';
        });

        this.appendChild(divHead);
        this.appendChild(this.divs[0]);
        this.appendChild(this.divs[1]);
        this.divs[0].style.display = 'none';
    }

    refreshChild() {
        const me = this;

        this.divs[1].innerHTML = '';

        if (!this.attrTitle || 0 === this.attrTitle.length) {
            // console.error('Invalid data-title');
            return;
        }

        if (!this.ds || 0 === this.ds.length) {
            return;
        }

        // -- filter
        let list = this.ds;
        if (0 < this.filter.length && this.attrValue) {
            list = list.filter(item => {
                return -1 < me.filter.findIndex(f => f === item[me.attrValue]);
            });
        }

        const length = list.length;

        // -- page
        const from = (this.page - 1) * this.pageSize; // included
        const to = this.page * this.pageSize; // not included
        list = list.filter((d, i) => from <= i && to > i);

        // -- element
        const ul = document.createElement('ul');

        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const li = document.createElement('li');
            li.textContent = item[this.attrTitle];
            li.style.fontFamily = 'monospace';
            li.getDataSource = () => item;
            li.style.cursor = 'pointer';

            li.addEventListener('click', (e) => {
                if (me.clickListener) {
                    me.clickListener(e);
                }
            });
            ul.appendChild(li);
        }

        // -- to parent
        this.divs[1].appendChild(ul);
    }

    refreshChildSummary() {
        const me = this;
        const p = this.divs[0];
        p.innerHTML = '';

        if (!this.attrTitle || 0 === this.attrTitle.length) {
            return;
        }

        if (!this.ds || 0 === this.ds.length) {
            return;
        }

        const types = new Map();
        const names = new Map();

        this.ds.forEach((item) => {
            const count = types.get(item[me.attrValue]);
            if (!count) {
                types.set(item[me.attrValue], 1);
                names.set(item[me.attrValue], item[me.attrTitle]);
            } else {
                types.set(item[me.attrValue], count + 1);
            }
        });

        const ul = document.createElement('ul');
        p.appendChild(ul);
        for (const [k, v] of names.entries()) {
            const count = types.get(k);
            const title = `[${count.toString().padStart(5, '0')}] ${v}`
            const elements = ListSections.CreateCheckbox(title);
            const chk = elements[0];
            chk.setAttribute('data-type', k);
            // -- change data-filter
            chk.addEventListener('change', (e) => {
                const filter = new Map();
                me.filter.forEach(d => filter.set(d, true));

                const checked = e.target.checked;
                const dataType = ~~e.target.getAttribute('data-type');

                if(checked) {
                    filter.set(dataType, true);
                } else {
                    filter.delete(dataType);
                }

                const filterArray = Array.from(filter.keys());
                me.setAttribute('data-filter', JSON.stringify(filterArray));
                me.setAttribute('data-page', 1);
                me.updatePageButtons();

            });

            const li = document.createElement('li');
            li.style.fontFamily = 'monospace';
            elements.forEach(e => li.appendChild(e));
            ul.appendChild(li);
        }
    }

    setOnClickListener(fn) {
        this.clickListener = fn;
    }

    moveToPage(element) {
        const page = ~~element.getAttribute('data-page');

        if (0 === page) {
            return;
        }

        this.setAttribute('data-page', page);

        this.updatePageButtons();
    }

    updatePageButtons() {
        this.btnPrev.textContent = this.page - 1;
        this.btnNext.textContent = this.page + 1;
        this.btnPrev.setAttribute('data-page', this.page - 1);
        this.btnNext.setAttribute('data-page', this.page + 1);
    }
}

customElements.define('list-sections', ListSections);