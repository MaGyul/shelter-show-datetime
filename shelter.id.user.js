// ==UserScript==
// @name         쉘터 정확한 날자 및 시간 표시
// @namespace    https://shelter.id/
// @version      1.6.1
// @description  쉘터 정확한 날자 및 시간 표시
// @author       MaGyul
// @match        *://shelter.id/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shelter.id
// @updateURL    https://raw.githubusercontent.com/MaGyul/shelter-show-datetime/main/shelter.id.user.js
// @downloadURL  https://raw.githubusercontent.com/MaGyul/shelter-show-datetime/main/shelter.id.user.js
// @grant        none
// ==/UserScript==

/*
 ● 수정된 내역
   - 카테고리 이동시 페이지 인식 정확도 항상
   - 코드 정리 및 안정성 개선
*/

(async function() {
    'use strict';
    const logger = {
        info: (...data) => console.log.apply(console, ['[ssd]', ...data]),
        warn: (...data) => console.warn.apply(console, ['[ssd]', ...data]),
        error: (...data) => console.error.apply(console, ['[ssd]', ...data])
    };

    const showChangePageBtn = 5;
    const domCache = {};
    const modalReg = /\(modal:\w\/(\w+-?\w+)\/(\d+)\)/;

    var shelterOwnerId = undefined;
    var shelterId = undefined;
    var historyBoardId = undefined;
    var boardChanged = false;
    var currentPage = 1;
    var retryCount = 1;
    window.resetRetryCount = () => {
        retryCount = 0;
        logger.info('최대 시도횟수 초기화 완료');
    };
    var observer = undefined;

    // history onpushstate setup
    (function(history){
        var pushState = history.pushState;
        history.pushState = function() {
            if (typeof history.onpushstate == "function") {
                history.onpushstate(...arguments);
            }
            return pushState.apply(history, arguments);
        };
    })(window.history);

    history.onpushstate = (state, a, pathname) => {
        main('history', pathname);
        for (let key in domCache) {
            let cache = domCache[key];
            if (document.body.contains(cache)) break;
            delete domCache[key];
        }
    };

    function obsesrverCallback(mutations) {
        initArticles();
    }

    function main(type, pathname) {
        try {
            if (type == 'history') {
                if (!modalReg.test(pathname)) {
                    let pathSplit = pathname.split('/');
                    let boardId = pathSplit.at(-1);
                    if (historyBoardId != boardId) {
                        historyBoardId = boardId;
                        boardChanged = true;
                    }
                }

                getShelterId(pathname).then(async sid => {
                    if (sid != null && shelterId != sid) {
                        logger.info('쉘터가 변경됨:', sid);
                        shelterId = sid;
                        shelterOwnerId = await getOwnerId();
                    }
                });
            }
            if (type == 'history' || type == 'script-injected') {
                if (modalReg.test(pathname)) {
                    updateDate();
                }
                setTimeout(initArticles, 1000);
            }
            if (type == 'script-injected') {
                fetchArticles('default');
                document.body.addEventListener('click', bodyClick, true);
                document.head.appendChild(createStyle());
                logger.info('날자 및 시간 표시 준비완료');
            }
        } catch(e) {
            logger.error(`스크립트 동작 오류(main(${type}, ${pathname}))`, e);
        }
    }

    function initArticles() {
        if (location.href.includes('/community/board/')) {
            findDom('app-board-list-container .page-size', (dom) => { // top page-size
                dom.onchange = refrash;
            });
            findDom('div.search > app-search-box > div > div > input.sb-input', (dom) => { // bottom
                dom.onkeypress = (e) => {
                    if (e.key == 'Enter') {
                        let ori = document.querySelector('div.search > app-search-box > div > div > select.sb-select');
                        let set = document.querySelector('.ngx-ptr-content-container > app-search-box > div > div > select.sb-select');
                        set.selectedIndex = ori.selectedIndex;
                        refrash();
                    }
                }
            });
            findDom('.ngx-ptr-content-container > app-search-box > div > div > input.sb-input', (dom) => { // top
                dom.onkeypress = (e) => {
                    if (e.key == 'Enter') {
                        let ori = document.querySelector('.ngx-ptr-content-container > app-search-box > div > div > select.sb-select');
                        let set = document.querySelector('div.search > app-search-box > div > div > select.sb-select');
                        set.selectedIndex = ori.selectedIndex;
                        refrash();
                    }
                }
            });
            findDom('div.search > app-search-box > div > div > fa-icon', (dom) => { // bottom
                dom.onclick = () => {
                    let ori = document.querySelector('div.search > app-search-box > div > div > select.sb-select');
                    let set = document.querySelector('.ngx-ptr-content-container > app-search-box > div > div > select.sb-select');
                    refrash();
                };
            });
            findDom('.ngx-ptr-content-container > app-search-box > div > div > fa-icon', (dom) => { // top
                dom.onclick = () => {
                    let ori = document.querySelector('.ngx-ptr-content-container > app-search-box > div > div > select.sb-select');
                    let set = document.querySelector('div.search > app-search-box > div > div > select.sb-select');
                    refrash();
                };
            });
            findDom('ngx-pull-to-refresh > div > div.ngx-ptr-content-container', async (dom) => { // bottom change btns
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
            findDom('.main__layout__section > .area__outlet', (dom) => { // articles list container
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
        if (isDescendant('tit-refresh', target)) {
            refrash();
        }
        if (isDescendant('board__footer', target, 10) && isDescendant('ngx-pagination', target)) {
            let li = getDescendantByTag('LI', target);
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

    function fetchArticles(type) {
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
        setTimeout(async () => {
            try {
                if ((await findDom('.board__body')).children.length <= 6) {
                    await wait(500);
                    return fetchArticles(type);
                }
                if (typeof shelterId === 'undefined') {
                    shelterId = await getShelterId();
                    if (retryCount >= 10) {
                        logger.warn('최대 다시시도 횟수 10회를 넘겼습니다. (스크립트가 동작하지 않을수도 있음)');
                        logger.warn('시도 횟수 초기화는 콘솔에 "resetRetryCount()"를 입력해주세요.');
                        return;
                    }
                    if (retryCount <= 10) {
                        retryCount += 1;
                    }
                    await wait(500);
                    return fetchArticles(type);
                }
                if (typeof shelterOwnerId === 'undefined') {
                    shelterOwnerId = await getOwnerId();
                    if (retryCount >= 10) {
                        logger.warn('최대 다시시도 횟수 10회를 넘겼습니다. (스크립트가 동작하지 않을수도 있음)');
                        logger.warn('시도 횟수 초기화는 콘솔에 "resetRetryCount()"를 입력해주세요.');
                        return;
                    }
                    if (retryCount <= 10) {
                        retryCount += 1;
                    }
                    await wait(500);
                    return fetchArticles(type);
                }
                retryCount = 0;
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
                let searchBox = document.querySelector('div.search > app-search-box > div > div > input.sb-input');
                let searchType = document.querySelector('div.search > app-search-box > div > div > select.sb-select');
                if (searchBox && searchBox.value.length != 0) {
                    searchQuery = `&searchType=${searchType.value}&keyword=${encodeURI(searchBox.value)}`
                }

                let query = `size=${pageSize}${searchQuery}${boardQuery}${ownerQuery}&page=${currentPage}`;

                fetchNotification();
                logger.info('글 리스트 조회중...');
                return safeFetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/articles/-/by-page?${query}`)
                    .then(updateDateArticles);
            } catch(e) {
                logger.error(`스크립트 동작 오류(fetchArticles(${type}))`, e);
            }
        }, 500);
    }

    function updateDateArticles(data) {
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
                let eles = document.querySelectorAll(`app-board-list-item[data-id="${item.id}"] > .SHELTER_COMMUNITY`);
                for (let ele of eles) {
                    let create_ele = ele.querySelector('.create');
                    let create_date = new Date(item.create_date);
                    let year = ('' + create_date.getFullYear()).substr(2);
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
        setTimeout(async () => {
            try {
                let sub_txt = await findDom("div > div > .sub-txt");
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
                        let match = location.href.match(modalReg);
                        let path = match[1];
                        let id = match[2];
                        let data = undefined;
                        switch (path) {
                            case 'simple-notice':
                                data = await safeFetch(`https://rest.shelter.id/v1.0/shelters/-/simple-notice/${id}`);
                                break;
                            case 'vote':
                                data = await safeFetch(`https://rest.shelter.id/v1.0/votes/${id}`);
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
        }, 200);
    }

    async function fetchNotification() {
        try {
            logger.info('전체 공지 조회중...');
            let data = await safeFetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/represent-boards/-/articles`);
            logger.info('전체 공지 조회 완료');
            updateDateArticles(data);
        } catch(e) {
            logger.error('스크립트 동작 오류(fetchNotification())', e);
        }
    }

    async function getPageSize() {
        try {
            let dom = await findDom('.page-size');
            var index = dom.selectedIndex;
            if (index === 1) return 80;
            if (index === 2) return 100;
        } catch(e) {
            logger.error('스크립트 동작 오류(getPageSize())', e);
        }
        return 40;
    }

    async function getShelterId(pathname = location.href) {
        try {
            let href = undefined;
            if (!pathname.includes('/base/')) {
                href = pathname.split('(')[0].replace(location.origin, '').substr(1);
            }
            if (href == undefined) {
                let canonical = await findDom('head > link[rel="canonical"]');
                href = canonical.href;
            }
            let split = href.replace(location.origin + '/', '').split('/');
            return split[0] === '' ? undefined : split[0];
        } catch(e) {
            logger.error('스크립트 동작 오류(getShelterId())', e);
            return undefined;
        }
    }

    async function getOwnerId() {
        if (typeof shelterId === 'undefined') {
            shelterId = await getShelterId();
        }
        let data = await safeFetch(`https://rest.shelter.id/v1.0/list-items/angular/shelter-detail/${shelterId}`);

        return data.shelter.owner.id;
    }

    function safeFetch(path, options) {
        return fetch(path, options)
            .catch((err) => {return {json: () => {return {error: err}}}})
            .then(r => r.status == 204 ? {json: () => {return {error: new Error('No Content')}}} : r)
            .then(r => r.json())
    }

    function change9under(i) {
        if (i <= 9) {
            i = '0' + i;
        }
        return i;
    }

    function topBtnUpdate(current, target) {
        if (target.disabled) {
            if (current.disabled) return;
            current.setAttribute('disabled', '');
        } else {
            current.removeAttribute('disabled');
        }
    }

    async function findDom(path, callback) {
        if (callback) {
            if (domCache[path] && document.body.contains(domCache[path])) {
                callback(domCache[path]);
                return;
            }
            let dom = document.querySelector(path);
            if (dom != null) {
                domCache[path] = dom;
                callback(dom);
                return;
            }
        } else {
            if (domCache[path] && document.body.contains(domCache[path])) {
                return domCache[path];
            }
            let dom = document.querySelector(path);
            if (dom != null) {
                domCache[path] = dom;
                return dom;
            }
        }
        await wait(500);
        return findDom(path, callback);
    }

    function isDescendant(parent, child, limit = 5) {
        var node = child.parentNode;
        while (node != null) {
            if (node.classList?.contains(parent)) {
                return true;
            }
            if (limit-- == 0) return false;
            node = node.parentNode;
        }
        return false;
    }

    function getDescendantByClass(parent, child, limit = 5) {
        var node = child.parentNode;
        while (node != null) {
            if (node.classList?.contains(parent)) {
                return node;
            }
            if (limit-- == 0) return false;
            node = node.parentNode;
        }
        return undefined;
    }

    function getDescendantByTag(parent, child, limit = 5) {
        var node = child.parentNode;
        while (node != null) {
            if (node.tagName == parent) {
                return node;
            }
            if (limit-- == 0) return false;
            node = node.parentNode;
        }
        return undefined;
    }

    function createStyle() {
        let style = document.createElement('style');
        style.textContent = `
        div.ngx-ptr-content-container > app-search-box > div > div > input.sb-input { width: 100%; }
        div.board__header > div > button.btn-wider.smol.search-btn { display: block; }
        `;
        return style;
    }

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    main('script-injected', location.pathname);
})();
