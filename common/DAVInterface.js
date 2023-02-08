class DAVInterface {
	static NS = "DAV:";

	constructor(str) {
		const xml = new DOMParser().parseFromString(str, "text/xml");
		this.xml = xml;
	}

	getByTagName(tag) {
		return DAVInterface.GetByTagName(this.xml, tag);
	}

	static GetByTagName(parser, tag) {
		return parser.getElementsByTagNameNS(DAVInterface.NS, tag);
	}

	static GetFirsts(parser, listTags) {
		const r = {};
		listTags.forEach((tag) => {
			r[tag] = DAVInterface.GetByTagName(parser, tag)[0];
		});
		return r;
	}

	static GetFirstsText(parser, listTags) {
		const r = DAVInterface.GetFirsts(parser, listTags);
		for (const [k, v] of Object.entries(r)) {
			r[k] = v?.textContent;
		}

		return r;
	}

	static ResponseToFileObject(xmlResponse) {
		const obj = DAVInterface.GetFirstsText(xmlResponse, [
			"href",
			"displayname",
			"getlastmodified",
			"getcontentlength",
			"collection"
		]);

		obj.datemodified = new Date(obj.getlastmodified);
		obj.isdir = "" === obj.collection; // when collection is '' its directory

		// -- kind of waste but explicit copy
		const fileObj = {
			href: obj.href, // '/absolute/path/to/file.zip'
			datemodified: obj.datemodified, // date object
			displayname: obj.displayname, // 'file.zip'
			size: ~~obj.getcontentlength,
			isdir: obj.isdir // true / false
		};
		return fileObj;
	}

	static async FetchPropFind(base, path) {
		let requestURL = base;
		if (path) {
			const basePath = base.replace(/\/*$/, ""); // no / at the end
			requestURL = basePath + "/" + path.replace(/^\/*/, ""); // no / at first
		}

		const r = await fetch(requestURL, {
			method: "PROPFIND"
		});
		const t = await r.text();

		return t;
	}

	// -- Fetch and to file object
	static async Fetch(base, path) {
		const t = await DAVInterface.FetchPropFind(base, path);
		const xml = new DAVInterface(t);
		const res = xml.getByTagName("response");

		return Array.from(res).map(DAVInterface.ResponseToFileObject);
	}
}