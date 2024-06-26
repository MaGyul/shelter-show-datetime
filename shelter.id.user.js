// ==UserScript==
// @name         쉘터 정확한 날자 및 시간 표시
// @namespace    https://shelter.id/
// @version      1.2.1
// @description  쉘터 정확한 날자 및 시간 표시
// @author       MaGyul
// @match        https://shelter.id/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shelter.id
// @updateURL    https://raw.githubusercontent.com/MaGyul/test/main/shelter.id.user.js
// @downloadURL  https://raw.githubusercontent.com/MaGyul/test/main/shelter.id.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    var nextId = undefined;
    var prevId = undefined;

    document.addEventListener("DOMContentLoaded", () => main('dom-loaded'));

    // history onpushstate setup
    (function(history){
        var pushState = history.pushState;
        history.pushState = function(state) {
            if (typeof history.onpushstate == "function") {
                history.onpushstate({state: state});
            }
            return pushState.apply(history, arguments);
        };
    })(window.history);

    history.onpushstate = () => main('history');

    function main(type) {
        if (type == 'history') {
            updateDate();
        } else if (type == 'script-injected') {
            findDom('.tit-refresh', (dom) => {
                dom.onclick = () => {
                    fetchArticles('default');
                };
            });
            findDom('button.prev', (dom) => {
                dom.onclick = () => {
                    fetchArticles('prev');
                };
            });
            findDom('button.next', (dom) => {
                dom.onclick = () => {
                    fetchArticles('next');
                };
            });
            findDom('.page-size', (dom) => {
                dom.onchange = () => {
                    fetchArticles('default');
                }
            });
        }
        if (type != 'history') {
            fetchArticles('default');
        }
    }

    function fetchArticles(type) {
        setTimeout(() => {
            if (document.querySelector('.board__body')?.children?.length <= 6) {
                return fetchArticles(type);
            }
            let pageSize = getPageSize();
            let pathSplit = location.pathname.split('/');
            let shelterId = pathSplit[1];
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
            // https://rest.shelter.id/v1.0/list-items/personal/gM7ZgsaLScbOwQ5eQ/shelter/articles?offset_id=433524&size=40 next
            // https://rest.shelter.id/v1.0/list-items/personal/gM7ZgsaLScbOwQ5eQ/shelter/articles?prev_id=433521&size=40 prev
            switch(type) {
                case 'next':
                    fetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/${boardsPath}articles?${nextId ? 'offset_id=' + nextId + '&' : ''}${isOwner}size=${pageSize}`)
                        .then(r => r.json()).then(updateDateArticles);
                    break;
                case 'prev':
                    fetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/${boardsPath}articles?${prevId ? 'prev_id=' + prevId + '&' : ''}${isOwner}size=${pageSize}`)
                        .then(r => r.json()).then(updateDateArticles);
                    break;
                default:
                    fetch(`https://rest.shelter.id/v1.0/list-items/personal/${shelterId}/shelter/${boardsPath}articles?${isOwner}size=${pageSize}`)
                        .then(r => r.json()).then(updateDateArticles);
                    break;
            }
        }, 500);
    }

    function updateDateArticles(data) {
        if (!Array.isArray(data.list)) {
            data = data.list;
        }
        if (data.has_next) {
            nextId = data.list[data.list.length - 1].id;
        }
        if (data.has_prev) {
            prevId = data.list[0].id;
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
            }
        }
    }

    function updateDate() {
        setTimeout(() => {
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
                let datetime = new Date(time.getAttribute('datetime'));
                time_span.textContent = ` (${datetime.toLocaleString()})`;
                title_li.appendChild(time_span);
            }
        }, 200);
    }

    function getPageSize() {
        let dom = document.querySelector('.page-size');
        var index = dom.selectedIndex;
        if (index === 1) return 80;
        if (index === 2) return 100;
        return 40;
    }

    function change9under(i) {
        if (i <= 9) {
            i = '0' + i;
        }
        return i;
    }

    function findDom(path, callback) {
        setTimeout(() => {
            let dom = document.querySelector(path);
            if (dom) {
                callback(dom);
                return;
            }
            findDom(path, callback);
        }, 500);
    }

    main('script-injected');
})();
