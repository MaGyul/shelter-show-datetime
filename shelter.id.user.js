// ==UserScript==
// @name         쉘터 정확한 날자 및 시간 표시
// @namespace    https://shelter.id/
// @version      1.6.2
// @description  쉘터 정확한 날자 및 시간 표시
// @author       MaGyul
// @match        *://shelter.id/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shelter.id
// @require      https://raw.githubusercontent.com/MaGyul/shelter-utils/main/shelter-utils.js
// @updateURL    https://raw.githubusercontent.com/MaGyul/shelter-utils/main/shelter-show-datetime.user.js
// @downloadURL  https://raw.githubusercontent.com/MaGyul/shelter-utils/main/shelter-show-datetime.user.js
// @grant        none
// ==/UserScript==

/*
 ● 수정된 내역
   - 반복되서 사용되는 함수 및 변수를 한 스크립트에 모아서 사용
   - 코드 정리 및 안정성 개선
*/

(async function() {
    'use strict';
    var logger;

    const showChangePageBtn = 5;

    var shelterOwnerId = undefined;
    var shelterId = undefined;
    var historyBoardId = undefined;
    var boardChanged = false;
    var currentPage = 1;
    var observer = undefined;

    window.addEventListener('su-loaded', () => {
        logger = ShelterUtils.getLogger('show-datetime');
        main('su-loaded', location.href);
    });

    window.addEventListener('history', (event) => {
        const { pathname } = event.detail;
        main('history', pathname);
    })

    function obsesrverCallback(mutations) {
        initArticles();
    }

    async function main(type, pathname) {
        try {
            if (type == 'history') {
                if (!ShelterUtils.modalReg.test(pathname)) {
                    let pathSplit = pathname.split('/');
                    let boardId = pathSplit.at(-1);
                    if (historyBoardId != boardId) {
                        historyBoardId = boardId;
                        boardChanged = true;
                    }
                }

                ShelterUtils.getShelterId(pathname).then(async sid => {
                    if (sid != null && shelterId != sid) {
                        (logger ?? console).info('쉘터가 변경됨:', sid);
                        shelterId = sid;
                        shelterOwnerId = await ShelterUtils.getOwnerId(sid);
                    }
                });
            }
            if (type == 'history' || type == 'su-loaded') {
                if (ShelterUtils.modalReg.test(pathname)) {
                    updateDate();
                }
                setTimeout(initArticles, 1000);
            }
            if (type == 'su-loaded') {
                fetchArticles('default');
                document.body.addEventListener('click', bodyClick, true);
                ShelterUtils.appendStyle('show-datetime.style');
                logger.info('날자 및 시간 표시 준비완료');
            }
            if (type == 'script-injected') {
                if (typeof ShelterUtils === 'undefined') {
                    const script = document.createElement('script');
                    script.classList.add('shelter-utils');
                    script.textContent = await fetch('https://raw.githubusercontent.com/MaGyul/shelter-utils/main/shelter-utils.js').then(r => r.text());
                    document.head.appendChild(script);
                }
            }
        } catch(e) {
            logger.error(`스크립트 동작 오류(main(${type}, ${pathname}))`, e);
        }
    }

    function initArticles() {
        if (location.href.includes('/community/board/')) {
            ShelterUtils.findDom('app-board-list-container .page-size', (dom) => { // top page-size
                if (!dom) return;
                dom.onchange = refrash;
            });
            ShelterUtils.findDom('div.search > app-search-box > div > div > input.sb-input', (dom) => { // bottom
                if (!dom) return;
                dom.onkeypress = (e) => {
                    if (e.key == 'Enter') {
                        let ori = document.querySelector('div.search > app-search-box > div > div > select.sb-select');
                        let set = document.querySelector('.ngx-ptr-content-container > app-search-box > div > div > select.sb-select');
                        set.selectedIndex = ori.selectedIndex;
                        refrash();
                    }
                }
            });
            ShelterUtils.findDom('.ngx-ptr-content-container > app-search-box > div > div > input.sb-input', (dom) => { // top
                if (!dom) return;
                dom.onkeypress = (e) => {
                    if (e.key == 'Enter') {
                        let ori = document.querySelector('.ngx-ptr-content-container > app-search-box > div > div > select.sb-select');
                        let set = document.querySelector('div.search > app-search-box > div > div > select.sb-select');
                        set.selectedIndex = ori.selectedIndex;
                        refrash();
                    }
                }
            });
            ShelterUtils.findDom('div.search > app-search-box > div > div > fa-icon', (dom) => { // bottom
                if (!dom) return;
                dom.onclick = refrash;
            });
            ShelterUtils.findDom('.ngx-ptr-content-container > app-search-box > div > div > fa-icon', (dom) => { // top
                if (!dom) return;
                dom.onclick = refrash;
            });
            ShelterUtils.findDom('ngx-pull-to-refresh > div > div.ngx-ptr-content-container', async (dom) => { // bottom change btns
                if (!dom) return;
                if (dom.querySelector('& > app-pagination') != null) {
                    dom.querySelector('& > app-pagination').remove();
                }
                let original = dom.querySelector('app-pagination');
                if (original == null) return;
                let app_pagination = original.cloneNode(true);
                dom.insertBefore(app_pagination, dom.querySelector('& > .board__body'));

                let ori_nav = original.querySelector('custom-pagination-template > nav[role="navigation"]');
                let ori_ul = ori_nav.querySelector('& > ul');

                let nav = app_pagination.querySelector('custom-pagination-template > nav[role="navigation"]');
                let ul = nav.querySelector('& > ul');

                let ori_childNodes = [...ori_ul.childNodes].filter(e => e.tagName == 'LI');
                let childNodes = [...ul.childNodes].filter(e => e.tagName == 'LI');

                for (let i = 0; i < childNodes.length; i++) {
                    let ori_node = ori_childNodes[i];
                    let node = childNodes[i];
                    if (boardChanged && ori_node.classList.contains("current")) {
                        let changePage = ori_node.querySelector('span > span:nth-child(2)')?.textContent;
                        if (changePage) {
                            fetchArticles(changePage);
                            boardChanged = false;
                        }
                    }
                    node.onclick = (e) => {
                        let a = ori_node.querySelector('& > a');
                        if (a) a.click();
                    }
                }
            });
            ShelterUtils.findDom('.main__layout__section > .area__outlet', (dom) => { // articles list container
                if (!dom) return;
                if (observer != undefined) {
                    observer.disconnect();
                    observer = undefined;
                }
                observer = new MutationObserver(obsesrverCallback);
                observer.observe(dom, {
                    attributes: true,
                    childList: true,
                    characterData: true,
                    subtree: true
                });
            });
        }
    }

    function bodyClick(e) {
        let target = e.target;
        if (ShelterUtils.isDescendant('tit-refresh', target)) {
            refrash();
        }
        if (ShelterUtils.isDescendant('board__footer', target, 10) && ShelterUtils.isDescendant('ngx-pagination', target)) {
            let li = ShelterUtils.getDescendant('LI', target);
            if (li.classList.contains('pagination-previous')) {
                fetchArticles('prev');
            } else if (li.classList.contains('current')) {
                // TODO 인식 필요없는 태그
            } else if (li.classList.contains('ellipsis')) {
                fetchArticles('ellipsis');
            } else if (li.classList.contains('small-screen')) {
                // TODO 인식 필요없는 태그
            }else if (li.classList.contains('pagination-next')) {
                fetchArticles('next');
            } else {
                let changePage = li.querySelector('a > span:nth-child(2)').textContent;
                fetchArticles(changePage);
            }
        }
    }

    function refrash() {
        fetchArticles('refrash');
    }

    async function fetchArticles(type, limit = 10) {
        let changePage = Number(type);
        if (isNaN(changePage)) {
            if (type == 'refrash') {
                currentPage = 1;
            }
            if (type == 'next') {
                currentPage += 1;
            }
            if (type == 'prev') {
                currentPage -= 1;
            }
            if (type == 'ellipsis') {
                currentPage = currentPage - (currentPage % showChangePageBtn);
            }
        } else {
            currentPage = changePage;
        }
        await ShelterUtils.wait(500);
        try {
            let boardBody = await ShelterUtils.findDom('.board__body', 50);
            if (!boardBody) {
                if (limit-- == 0) return;
                await ShelterUtils.wait(500);
                return fetchArticles(type, limit);
            }
            if (boardBody.children.length <= 6) {
                if (limit-- == 0) return;
                await ShelterUtils.wait(500);
                return fetchArticles(type, limit);
            }
            if (typeof shelterId === 'undefined') {
                shelterId = await ShelterUtils.getShelterId();
                if (limit-- == 0) return;
                await ShelterUtils.wait(500);
                return fetchArticles(type, limit);
            }
            if (typeof shelterOwnerId === 'undefined') {
                shelterOwnerId = await ShelterUtils.getOwnerId(shelterId);
                if (limit-- == 0) return;
                await ShelterUtils.wait(500);
                return fetchArticles(type, limit);
            }
            
            let pageSize = await getPageSize();
            let pathname = location.pathname.split('(')[0];
            let pathSplit = pathname.split('/');
            if (shelterId == 'planet') return;
            let boardId = pathSplit.at(-1);
            let boardQuery = '';
            if (pathname.includes('/board/') && boardId != 'all') {
                boardQuery = `&boardId=${boardId}`;
            }
            let ownerQuery = '';
            if (boardId == 'owner') {
                boardQuery = '';
                ownerQuery = `&ownerId=${shelterOwnerId}`;
            }
            let searchQuery = '';
            let searchBox = await ShelterUtils.findDom('div.search > app-search-box > div > div > input.sb-input');
            let searchType = await ShelterUtils.findDom('div.search > app-search-box > div > div > select.sb-select');
            if (searchBox && searchBox.value.length != 0) {
                searchQuery = `&searchType=${searchType.value}&keyword=${encodeURI(searchBox.value)}`
            }

            let query = `size=${pageSize}${searchQuery}${boardQuery}${ownerQuery}&page=${currentPage}`;

            fetchNotification();
            logger.info('글 리스트 조회중...');
            return ShelterUtils.safeFetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/articles/-/by-page?${query}`)
                .then(updateDateArticles);
        } catch(e) {
            logger.error(`스크립트 동작 오류(fetchArticles(${type}))`, e);
        }
    }

    async function updateDateArticles(data) {
        try {
            if (typeof data.error !== 'undefined') {
                logger.error('글 리스트 불러오기 실패', data.error);
                logger.warn('글 리스트 날자가 패치 진행 불가능');
                return;
            }
            let noti = false;
            if (Array.isArray(data.items)) {
                data = data.items[0].articles;
                noti = true;
            } else {
                logger.info('글 리스트 조회 완료');
            }
            if (!Array.isArray(data.list)) {
                data = data.list;
            }
            if (typeof data === 'undefined') return;

            let currentDate = new Date;
            for (let item of (noti ? data.list : data.content)) {
                let eles = await ShelterUtils.findDomAll(`app-board-list-item[data-id="${item.id}"] > .SHELTER_COMMUNITY`);
                for (let ele of eles) {
                    let create_ele = ele.querySelector('.create');
                    let create_date = new Date(item.create_date);
                    let year = ('' + create_date.getFullYear()).substring(2);
                    let month = change9under(create_date.getMonth() + 1);
                    let date = change9under(create_date.getDate());
                    let hours = change9under(create_date.getHours());
                    let minutes = change9under(create_date.getMinutes());
                    let seconds = change9under(create_date.getSeconds());
                    // 생성된 날자가 오늘일 경우
                    if (currentDate.getDate() == date) {
                        create_ele.textContent = `${hours}:${minutes}:${seconds}`;
                    } else {
                        create_ele.textContent = `${year}-${month}-${date}`;
                    }
                    create_ele.title = create_date.toLocaleString() + '.' + create_date.getMilliseconds().toString().padStart(3, 0);
                }
            }
        } catch(e) {
            logger.error('스크립트 동작 오류(updateDateArticles(data...))', e);
        }
    }

    function updateDate() {
        ShelterUtils.wait(200).then(async () => {
            try {
                let sub_txt = await ShelterUtils.findDom("div > div > .sub-txt");
                if (!sub_txt) return;
                let title_li = sub_txt.querySelector('.sub-txt > li:nth-child(1)');
                if (!title_li) {
                    title_li = sub_txt;
                }
                let time_span = title_li.querySelector('.datetime');
                if (!time_span) {
                    time_span = document.createElement('span');
                    time_span.classList.add('datetime');
                    let time = title_li.querySelector('time');
                    let datetime = undefined;
                    if (!time) {
                        let match = location.href.match(ShelterUtils.modalReg);
                        let path = match[1];
                        let id = match[2];
                        let data = undefined;
                        switch (path) {
                            case 'simple-notice':
                                data = await ShelterUtils.safeFetch(`https://rest.shelter.id/v1.0/shelters/-/simple-notice/${id}`);
                                break;
                            case 'vote':
                                data = await ShelterUtils.safeFetch(`https://rest.shelter.id/v1.0/votes/${id}`);
                                break;
                        }
                        if (data && data.create_date) {
                            datetime = new Date(data.create_date);
                        }
                    } else {
                        datetime = new Date(time.getAttribute('datetime'));
                    }
                    if (datetime) {
                        time_span.textContent = ` (${datetime.toLocaleString()}.${datetime.getMilliseconds().toString().padStart(3, 0)})`;
                        title_li.appendChild(time_span);
                    }
                }
            } catch(e) {
                logger.error('스크립트 동작 오류(updateDate())', e);
            }
        });
    }

    async function fetchNotification() {
        try {
            logger.info('전체 공지 조회중...');
            let data = await ShelterUtils.safeFetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/represent-boards/-/articles`);
            logger.info('전체 공지 조회 완료');
            updateDateArticles(data);
        } catch(e) {
            logger.error('스크립트 동작 오류(fetchNotification())', e);
        }
    }

    async function getPageSize() {
        try {
            let dom = await ShelterUtils.findDom('.page-size');
            if (dom) {
                var index = dom.selectedIndex;
                if (index === 1) return 80;
                if (index === 2) return 100;
            }
        } catch(e) {
            logger.error('스크립트 동작 오류(getPageSize())', e);
        }
        return 40;
    }

    function change9under(i) {
        if (i <= 9) {
            i = '0' + i;
        }
        return i;
    }

    main('script-injected', location.pathname);
})();
