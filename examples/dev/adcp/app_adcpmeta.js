const app = (() => {
    // -- for devs
    if (!window.ParserPD0 && window.MarineParser) {
        window.ParserPD0 = MarineParser.ParserPD0;
    }

    async function loadTest() {
        const list = ['/raw/adcp/01.lta', '/raw/adcp/07.lta', '/raw/adcp/08.lta'];

        for (let i = 0; i < list.length; i++) {
            const f = list[i];
            const r = await fetch(f);
            const ab = await r.arrayBuffer();
            const meta = ParserPD0.ParseMeta(ab, true);
            console.log(meta);
        }
    }

    function main() {
        if(!ParserPD0) {
            console.error('Can not load pd0 meta app');
        } else {
            loadTest();
        }
    }

    main();
})();
