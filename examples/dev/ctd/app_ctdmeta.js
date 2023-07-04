const app = (() => {
    // -- for devs
    if (!window.ParserCTD && window.MarineParser) {
        window.ParserCTD = MarineParser.ParserCTD;
    }

    const fileList = new ParserCTD.CTDFileList();

    async function loadTest() {
        const list = [
            '/raw/ctd/COD_OM01_01.bl',
            '/raw/ctd/COD_OM01_01.hdr',
            '/raw/ctd/COD_OM01_01.hex',
            '/raw/ctd/COD_OM01_01.XMLCON',
            '/raw/ctd/COD_OX10-2_01.bl',
            '/raw/ctd/COD_OX10-2_01.hdr',
            '/raw/ctd/COD_OX10-2_01.hex',
            '/raw/ctd/COD_OX10-2_01.XMLCON',
            '/raw/ctd/COD_OX17-2_01.bl',
            '/raw/ctd/COD_OX17-2_01.hdr',
            '/raw/ctd/COD_OX17-2_01.hex',
            '/raw/ctd/COD_OX17-2_01.XMLCON',
            '/raw/ctd/COD_O18-2_01.bl',
            '/raw/ctd/COD_O18-2_01.hdr',
            '/raw/ctd/COD_O18-2_01.hex',
            '/raw/ctd/COD_O18-2_01.XMLCON',
        ];

        for (let i = 0; i < list.length; i++) {
            const f = list[i];
            fileList.addURL(f);
        }

        fileList.getGroups().forEach(async (d) => {
            await d.parseURLs();
            const meta = d.parseMeta();
            console.log(meta);
        });
    }

    async function onChangeFile(input) {
        const files = input.files;
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            fileList.addFile(f);
        }

        fileList.getGroups().forEach(async (d) => {
            await d.parseURLs();
            const meta = d.parseMeta();
            console.log(meta);
        });
    }

    function main() {
        if(!ParserCTD) {
            console.error('Can not load ctd meta app');
        } else {
            loadTest();
        }
    }

    main();

    return {
        onChangeFile: onChangeFile
    }
})();