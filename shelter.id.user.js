// ==UserScript==
// @name         쉘터 정확한 날자 및 시간 표시
// @namespace    https://shelter.id/
// @version      1.5.1
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
   - 투표, 한줄 공지 글에도 날짜 및 시간이 표시됩니다.
   - 글 리스트에서 검색 후 날짜가 적용 안 되던 버그 수정
   - 코드 정리 및 안정성 개선
*/

(function() {
    'use strict';
    const logger = {
        info: (...data) => console.log.apply(console, ['[ssd]', ...data]),
        warn: (...data) => console.warn.apply(console, ['[ssd]', ...data]),
        error: (...data) => console.error.apply(console, ['[ssd]', ...data])
    };

    const domCache = {};
    const modalReg = /\(modal:\w\/(\w+-?\w+)\/(\d+)\)/;

    var shelterId = undefined;
    var nextId = undefined;
    var prevId = undefined;
    var retryCount = 1;
    window.resetRetryCount = () => {
        retryCount = 0;
        logger.info('최대 시도횟수 초기화 완료');
    };
    var top_prev_btn = undefined;
    var top_next_btn = undefined;
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
        let ms = mutations.map(m => m.target).filter(e => e.classList != undefined);
        if (top_prev_btn) {
            let prev_btn = ms.find(e => e.classList.contains('prev'));
            if (prev_btn) {
                topBtnUpdate(top_prev_btn, prev_btn);
            } else {
                findDom('app-board-list-container .board__footer button.prev', (dom) => {
                    topBtnUpdate(top_prev_btn, dom);
                });
            }
        }
        if (top_next_btn) {
            let next_btn = ms.find(e => e.classList.contains('next'));
            if (next_btn) {
                topBtnUpdate(top_next_btn, next_btn);
            } else {
                findDom('app-board-list-container .board__footer button.next', (dom) => {
                    topBtnUpdate(top_next_btn, dom);
                });
            }
        }
    }

    function main(type, pathname) {
        try {
            if (type == 'history') {
                if (modalReg.test(pathname)) {
                    updateDate();
                } else {
                    findDom('app-board-list-container button.prev', (dom) => {
                        if (dom.disabled) {
                            fetchArticles('default');
                        }
                    });
                }

                getShelterId(pathname).then(sid => {
                    if (sid != null && shelterId != sid) {
                        logger.info('쉘터가 변경됨:', sid);
                        shelterId = sid;
                    }
                });
            }
            if (type == 'history' || type == 'script-injected') {
                setTimeout(initArticles, 1000);
            }
            if (type == 'script-injected') {
                fetchArticles('default');
                logger.info('날자 및 시간 표시 준비완료');
            }
        } catch(e) {
            logger.error(`스크립트 동작 오류(main(${type}, ${pathname}))`, e);
        }
    }

    function initArticles() {
        if (location.href.includes('/community/board/')) {
            findDom('app-board-list-container .tit-refresh', (dom) => {
                dom.onclick = refrash;
            });
            findDom('app-board-list-container .board__footer button.prev', (dom) => {
                dom.onclick = prevBtn;
            });
            findDom('app-board-list-container .board__footer button.next', (dom) => {
                dom.onclick = nextBtn;
            });
            findDom('app-board-list-container .page-size', (dom) => {
                dom.onchange = refrash;
            });
            findDom('app-board-list-container app-search-box > div > input', (dom) => {
                dom.onkeypress = (e) => {
                    if (e.key == 'Enter') {
                        refrash();
                    }
                }
            });
            findDom('app-board-list-container app-search-box > div > fa-icon', (dom) => {
                dom.onclick = refrash;
            });
            findDom('ngx-pull-to-refresh > div > div.ngx-ptr-content-container', (dom) => {
                if (dom.querySelector('& > app-button-prev-next') == null) {
                    let original = dom.querySelector('app-button-prev-next');
                    if (original == null) return;
                    let prev_next = original.cloneNode(true);

                    let prev_btn = prev_next.querySelector('button.prev');
                    top_prev_btn = prev_btn;
                    prev_btn.addEventListener('click', () => findDom('app-board-list-container .board__footer button.prev', (dom) => dom.click()));

                    let next_btn = prev_next.querySelector('button.next');
                    top_next_btn = next_btn;
                    next_btn.addEventListener('click', () => findDom('app-board-list-container .board__footer button.next', (dom) => dom.click()));

                    dom.insertBefore(prev_next, dom.querySelector('& > .board__body'));
                } else {
                    let prev_next = dom.querySelector('& > app-button-prev-next');
                    top_prev_btn = prev_next.querySelector('button.prev');
                    top_next_btn = prev_next.querySelector('button.next');
                }
            });
            findDom('.main__layout__section > .area__outlet', (dom) => {
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

    function refrash() {
        fetchArticles('default');
    }

    function prevBtn() {
        fetchArticles('prev');
    }

    function nextBtn() {
        fetchArticles('next');
    }

    function fetchArticles(type) {
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
                let pageSize = await getPageSize();
                let pathname = location.pathname.split('(')[0];
                let pathSplit = pathname.split('/');
                if (shelterId == 'planet') return;
                let boardId = pathSplit.at(-1);
                let boardsPath = '';
                if (pathname.includes('/board/') && boardId != 'all') {
                    boardsPath = `boards/${boardId}/`;
                }
                let isOwner = '';
                if (boardId == 'owner') {
                    boardsPath = '';
                    isOwner = 'is_only_shelter_owner=true&';
                }
                let searchQuery = '';
                let searchBox = await findDom('app-search-box > div > input.sb-input');
                if (searchBox && searchBox.value.length != 0) {
                    searchQuery = `title=${encodeURI(searchBox.value)}&`
                }

                let query = `size=${pageSize}`;
                switch(type) {
                    case 'next':
                        query = `${nextId ? 'offset_id=' + nextId + '&' : ''}${isOwner}` + searchQuery + query;
                        break;
                    case 'prev':
                        query = `${prevId ? 'prev_id=' + prevId + '&' : ''}${isOwner}` + searchQuery + query;
                        break;
                    default:
                        query = isOwner + searchQuery + query;
                        break;
                }

                fetchNotification();
                logger.info('글 리스트 조회중...');
                return safeFetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/${boardsPath}articles?${query}`)
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
            if (!noti) {
                if (data.has_next) {
                    nextId = data.list.at(-1).id;
                } else nextId = undefined;
                if (data.has_prev) {
                    prevId = data.list[0].id;
                } else prevId = undefined;
            }

            let currentDate = new Date;
            for (let item of data.list) {
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
                    create_ele.title = create_date.toLocaleString();
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
                        time_span.textContent = ` (${datetime.toLocaleString()})`;
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

    function wait(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    main('script-injected', location.pathname);
})();
