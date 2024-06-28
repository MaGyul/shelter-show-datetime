// ==UserScript==
// @name         쉘터 정확한 날자 및 시간 표시
// @namespace    https://shelter.id/
// @version      1.4.1
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
   - 원픽 쉘터로 지정후 그 경로로 쉘터에 진입할시 스크립트가 동작하지 않는 버그 수정
   - 스크립트 동작시 "[ssd] ..." 로그 출력 (F12로 개발자 도구에 진입 후 Console(콘솔)탭으로 이동시 볼 수 있음)
   - 스크립트 동장중에 오류 발생시 "[ssd] 스크립트 동작 오류..."으로 오류 로그 출력 (F12로 개발자 도구에 진입 후 Console(콘솔)탭으로 이동시 볼 수 있음)
*/

(function() {
    'use strict';
    const logger = {
        info: (...data) => console.log.apply(console, ['[ssd]', ...data]),
        warn: (...data) => console.warn.apply(console, ['[ssd]', ...data]),
        error: (...data) => console.error.apply(console, ['[ssd]', ...data])
    };

    var shelterId = getShelterId();
    var nextId = undefined;
    var prevId = undefined;
    var retryCount = 1;
    window.resetRetryCount = () => {
        retryCount = 0;
        logger.info('최대 시도횟수 초기화 완료');
    };

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

    history.onpushstate = (state, a, pathname) => main('history', pathname);

    // 감시자 인스턴스 만들기
    const observer = new MutationObserver((mutations) => {
        initArticles();
    });

    function main(type, pathname) {
        try {
            if (type == 'history') {
                updateDate();

                findDom('app-board-list-container button.prev', (dom) => {
                    if (dom.disabled) {
                        fetchArticles('default');
                    }
                });
            }
            if (type == 'history' || type == 'script-injected') {
                setTimeout(initArticles, 1000);
            }
            if (type == 'script-injected') {
                fetchArticles('default');
                findDom('app-shelter-community-page-board', (dom) => {
                    observer.observe(dom, {
                        attributes: true,
                        childList: true,
                        characterData: true,
                        subtree: true
                    });
                });
                logger.info('날자 및 시간 표시 준비완료');
            }
        } catch(e) {
            logger.error(`스크립트 동작 오류(main(${type}, ${pathname}))`, e);
        }
    }

    function initArticles() {
        findDom('app-board-list-container .tit-refresh', (dom) => {
            dom.onclick = refrash;
        });
        findDom('app-board-list-container button.prev', (dom) => {
            dom.onclick = prevBtn;
        });
        findDom('app-board-list-container button.next', (dom) => {
            dom.onclick = nextBtn;
        });
        findDom('app-board-list-container .page-size', (dom) => {
            dom.onchange = refrash;
        });
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
        setTimeout(() => {
            try {
                if (document.querySelector('.board__body')?.children?.length <= 6) {
                    return fetchArticles(type);
                }
                if (typeof shelterId === 'undefined') {
                    shelterId = getShelterId();
                    if (retryCount >= 5) {
                        logger.warn('최대 다시시도 횟수 5회를 넘겼습니다. (스크립트가 동작하지 않을수도 있음)');
                        logger.warn('시도 횟수 초기화는 콘솔에 "resetRetryCount()"를 입력해주세요.');
                        return;
                    }
                    if (retryCount <= 5) {
                        retryCount += 1;
                    }
                    return fetchArticles(type);
                }
                let pageSize = getPageSize();
                let pathname = location.pathname.split('(')[0];
                let pathSplit = pathname.split('/');
                if (shelterId == 'planet') return;
                let boardId = pathSplit.at(-1);
                let boardsPath = '';
                if (boardId != 'all') {
                    boardsPath = `boards/${boardId}/`;
                }
                let isOwner = '';
                if (boardId == 'owner') {
                    boardsPath = '';
                    isOwner = 'is_only_shelter_owner=true&';
                }

                let query = `size=${pageSize}`;
                switch(type) {
                    case 'next':
                        query = `${nextId ? 'offset_id=' + nextId + '&' : ''}${isOwner}` + query;
                        break;
                    case 'prev':
                        query = `${prevId ? 'prev_id=' + prevId + '&' : ''}${isOwner}` + query;
                        break;
                    default:
                        query = isOwner + query;
                        break;
                }

                fetchNotification();
                logger.info('글 리스트 조회중...');
                return fetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/${boardsPath}articles?${query}`)
                    .catch((err) => {return {json: () => {return {error: err}}}})
                    .then(r => r.json()).then(updateDateArticles);
            } catch(e) {
                logger.error(`스크립트 동작 오류(fetchArticles(${type}))`, e);
            }
        }, 500);
    }

    function updateDateArticles(data) {
        try {
            if (typeof data.error !== 'undefined') {
                logger.error('글 리스트 불러오기 실패');
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

            for (let item of data.list) {
                let ele = [...document.querySelectorAll(`app-board-list-item[data-id="${item.id}"] > .SHELTER_COMMUNITY`)].at(-1);
                if (ele) {
                    let create_ele = ele.querySelector('.create');
                    let create_date = new Date(item.create_date);
                    let year = ('' + create_date.getFullYear()).substr(2);
                    let month = change9under(create_date.getMonth() + 1);
                    let date = change9under(create_date.getDate());
                    let hours = change9under(create_date.getHours());
                    let minutes = change9under(create_date.getMinutes());
                    let seconds = change9under(create_date.getSeconds());
                    // 생성된 날자가 오늘일 경우
                    if ((new Date).getDate() == date) {
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
        setTimeout(() => {
            try {
                let title_li = document.querySelector('.sub-txt > li:nth-child(1)');
                if (!title_li) {
                    updateDate();
                    return;
                }
                let time_span = title_li.querySelector('.datetime');
                if (!time_span) {
                    time_span = document.createElement('span');
                    time_span.classList.add('datetime');
                    let time = title_li.querySelector('time');
                    if (!time) return;
                    let datetime = new Date(time.getAttribute('datetime'));
                    time_span.textContent = ` (${datetime.toLocaleString()})`;
                    title_li.appendChild(time_span);
                }
            } catch(e) {
                logger.error('스크립트 동작 오류(updateDate())', e);
            }
        }, 200);
    }

    async function fetchNotification() {
        try {
            logger.info('전체 공지 조회중...');
            let data = await fetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/represent-boards/-/articles`)
            .catch((err) => {return {json: () => {return {error: err}}}})
            .then(r => r.json());
            logger.info('전체 공지 조회 완료');
            updateDateArticles(data);
        } catch(e) {
            logger.error('스크립트 동작 오류(fetchNotification())', e);
        }
    }

    function getPageSize() {
        try {
            let dom = document.querySelector('.page-size');
            var index = dom ? dom.selectedIndex : 0;
            if (index === 1) return 80;
            if (index === 2) return 100;
            return 40;
        } catch(e) {
            logger.error('스크립트 동작 오류(getPageSize())', e);
            return 40;
        }
    }

    function getShelterId() {
        try {
            let canonical = document.querySelector('head > link[rel="canonical"]');
            let split = canonical.href.substr(location.origin.length + 1).split('/');
            return split[0] === '' ? undefined : split[0];
        } catch(e) {
            logger.error('스크립트 동작 오류(getShelterId())', e);
            return undefined;
        }
    }

    function change9under(i) {
        if (i <= 9) {
            i = '0' + i;
        }
        return i;
    }

    function findDom(path, callback) {
        let dom = document.querySelector(path);
        if (typeof dom !== 'undefined') {
            callback(dom);
            return;
        }
        setTimeout(() => findDom(path, callback), 500);
    }

    main('script-injected', location.pathname);
})();
