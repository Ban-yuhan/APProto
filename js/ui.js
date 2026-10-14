/**
 * 게임 UI 및 모달 인터페이스 관리자 (ui.js)
 */
class GameUI {
    constructor(game) {
        this.game = game;

        // UI 엘리먼트 캐시
        this.el = {
            money: document.getElementById('hud-money'),
            revenue: document.getElementById('hud-revenue'),
            labor: document.getElementById('hud-labor'),
            profit: document.getElementById('hud-profit'),
            weatherIcon: document.getElementById('hud-weather-icon'),
            weatherName: document.getElementById('hud-weather-name'),
            weatherTimer: document.getElementById('hud-weather-timer'),
            dayCount: document.getElementById('hud-day-count'),
            dayPhase: document.getElementById('hud-day-phase'),
            dayProgress: document.getElementById('hud-day-progress'),
            reputation: document.getElementById('hud-reputation'),
            playerInventory: document.getElementById('hud-player-inventory'),

            // 하단 버튼
            btnWorkers: document.getElementById('btn-workers'),
            btnUpgrades: document.getElementById('btn-upgrades'),
            btnFever: document.getElementById('btn-fever'),
            feverTimerText: document.getElementById('fever-timer-text'),

            // 모달
            modalWorker: document.getElementById('modal-worker'),
            modalUpgrade: document.getElementById('modal-upgrade'),
            workerCardsContainer: document.getElementById('worker-cards-container'),
            veteranCardsContainer: document.getElementById('veteran-cards-container'),
            activeWorkersList: document.getElementById('active-workers-list'),
            btnRerollWorkers: document.getElementById('btn-reroll-workers'),
            btnCheatMoney: document.getElementById('btn-cheat-money'),

            // 트럭 출발 버튼 3D 오버레이 (지역별 3대 및 레거시)
            outboundDepartBtns: {
                daegu: document.getElementById('outbound-depart-btn-daegu'),
                busan: document.getElementById('outbound-depart-btn-busan'),
                seoul: document.getElementById('outbound-depart-btn-seoul')
            },
            outboundDepartBtn: document.getElementById('outbound-depart-btn'),

            // 알림 배너
            notificationToast: document.getElementById('notification-toast'),
            feverBanner: document.getElementById('fever-banner'),

            // 긴급 퀘스트 UI
            emergencyQuestPanel: document.getElementById('emergency-quest-panel'),
            emergencyQuestIcon: document.getElementById('emergency-quest-icon'),
            emergencyQuestTitle: document.getElementById('emergency-quest-title'),
            emergencyQuestDesc: document.getElementById('emergency-quest-desc'),
        };

        this.initEventListeners();
    }

    initEventListeners() {
        // 알바 관리 모달 열기
        this.el.btnWorkers.addEventListener('click', () => {
            if (window.soundManager) window.soundManager.playClick();
            this.openModal('worker');
        });

        // 업그레이드 모달 열기
        this.el.btnUpgrades.addEventListener('click', () => {
            if (window.soundManager) window.soundManager.playClick();
            this.openModal('upgrade');
        });

        // 앙팡데이 피버타임 버튼
        this.el.btnFever.addEventListener('click', () => {
            this.game.triggerFeverTime();
        });

        // 알바 리롤 버튼
        this.el.btnRerollWorkers.addEventListener('click', () => {
            this.game.workerManager.rerollCards(this.game.state);
        });

        // 테스트 지원금 (+1,000원) 버튼
        if (this.el.btnCheatMoney) {
            this.el.btnCheatMoney.addEventListener('click', () => {
                this.game.addTestMoney(1000);
            });
        }

        // 날씨 테스트 디버그 버튼들 (☀️ 맑음 / 🌧️ 폭우 / ⚡ 뇌우 / ❄️ 폭설)
        document.querySelectorAll('.btn-weather-test').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const weatherType = e.currentTarget.dataset.weather;
                if (!this.game.weatherManager) return;
                if (window.soundManager) window.soundManager.playClick();
                if (weatherType === 'clear') {
                    this.game.weatherManager.clearWeather(this.game.state);
                    this.showNotification('☀️ 날씨를 [맑음] 상태로 즉시 복구했습니다.', '#38bdf8');
                } else {
                    this.game.weatherManager.triggerWeather(weatherType, this.game.state);
                    const nameMap = { rain: '폭우 (배수로/차수판)', thunder: '뇌우 (정전/비상발전기)', snow: '폭설 (입고도로 제설)' };
                    this.showNotification(`⚠️ 기상 테스트 강제 발동: [${nameMap[weatherType] || weatherType}]`, '#f59e0b');
                }
            });
        });

        // 모달 닫기 버튼들
        document.querySelectorAll('.modal-close-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (window.soundManager) window.soundManager.playClick();
                this.closeAllModals();
            });
        });

        // 출고 트럭 출발 버튼 클릭 (대구/부산/서울 3개 지역별)
        if (this.el.outboundDepartBtns) {
            Object.entries(this.el.outboundDepartBtns).forEach(([region, btn]) => {
                if (btn) {
                    btn.addEventListener('click', () => {
                        this.game.logistics.departOutboundTruck(region, this.game.state);
                    });
                }
            });
        }
        if (this.el.outboundDepartBtn) {
            this.el.outboundDepartBtn.addEventListener('click', () => {
                this.game.logistics.departOutboundTruck('daegu', this.game.state);
            });
        }

        // 키보드 ESC로 모달 닫기
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });
    }

    // 모달 열기 (기획: 관리 UI 오픈 시 Time.timeScale = 0 처리)
    openModal(type) {
        this.game.setPause(true);

        if (type === 'worker') {
            if (this.game.workerManager) {
                this.game.workerManager.generateHireCards();
            }
            this.renderWorkerModal();
            this.el.modalWorker.classList.remove('hidden');
        } else if (type === 'upgrade') {
            this.renderUpgradeModal();
            this.el.modalUpgrade.classList.remove('hidden');
        }
    }

    closeAllModals() {
        this.el.modalWorker.classList.add('hidden');
        this.el.modalUpgrade.classList.add('hidden');
        this.game.setPause(false);
    }

    // 상단 HUD 실시간 갱신
    updateHUD() {
        const state = this.game.state;
        const laborCostMin = this.game.workerManager.calculateLaborCostPerMinute();
        const tier = state.warehouseTier || 1;
        const tierCfg = (GAME_CONFIG.WAREHOUSE_TIERS && GAME_CONFIG.WAREHOUSE_TIERS[tier - 1]) || (GAME_CONFIG.WAREHOUSE_TIERS && GAME_CONFIG.WAREHOUSE_TIERS[0]) || {};
        const maintenanceCostMin = Math.round((tierCfg.maintenanceCostSec || 0) * 60);
        const totalExpensesMin = laborCostMin + maintenanceCostMin;
        const netProfitMin = Math.round(state.recentRevenuePerMin - totalExpensesMin);

        const isNight = state.isNight || (state.dayTimer >= GAME_CONFIG.TIME.DAY_TIME);
        const nightBadgeHtml = isNight ? ' <span class="night-badge">(+야간)</span>' : '';

        this.el.money.textContent = Math.floor(state.money).toLocaleString() + '원';
        this.el.revenue.textContent = Math.round(state.recentRevenuePerMin).toLocaleString() + '원/분';
        this.el.labor.innerHTML = totalExpensesMin.toLocaleString() + '원/분' + nightBadgeHtml;
        
        this.el.profit.innerHTML = (netProfitMin >= 0 ? '+' : '') + netProfitMin.toLocaleString() + '원/분' + nightBadgeHtml;
        this.el.profit.className = netProfitMin >= 0 ? 'profit-plus' : 'profit-minus';

        this.el.reputation.textContent = '★ ' + state.reputation;

        // 플레이어 인벤토리 현황
        const inv = this.game.player.userData.inventory;
        const max = this.game.player.userData.maxInventory;
        this.el.playerInventory.textContent = `소지: ${inv.length} / ${max}`;

        // 시간 표시 (하루 120초: 낮 90초 / 밤 30초)
        const isDay = state.dayTimer < GAME_CONFIG.TIME.DAY_TIME;
        this.el.dayCount.textContent = `DAY ${state.currentDay}`;
        this.el.dayPhase.textContent = isDay ? '☀️ 낮' : '🌙 밤';
        const progressPct = (state.dayTimer / GAME_CONFIG.TIME.DAY_DURATION) * 100;
        this.el.dayProgress.style.width = `${progressPct}%`;

        // 앙팡데이 피버 버튼 상태
        if (state.isFeverTime) {
            this.el.btnFever.classList.add('fever-active');
            this.el.feverTimerText.textContent = `${Math.ceil(state.feverTimeRemaining)}초`;
        } else if (state.feverCooldownRemaining > 0) {
            this.el.btnFever.classList.remove('fever-active');
            this.el.btnFever.classList.add('btn-disabled');
            this.el.feverTimerText.textContent = `대기 ${Math.ceil(state.feverCooldownRemaining)}초`;
        } else {
            this.el.btnFever.classList.remove('fever-active', 'btn-disabled');
            this.el.feverTimerText.textContent = '발동 가능!';
        }
    }

    // 기상 상태 HUD 표시 (순수 날씨명만 깔끔하게 1줄로 표시)
    updateWeatherDisplay(weatherType, remainingSec, isResolved) {
        const info = GAME_CONFIG.WEATHER.TYPES[weatherType.toUpperCase()] || GAME_CONFIG.WEATHER.TYPES.CLEAR;
        if (this.el.weatherIcon) this.el.weatherIcon.textContent = info.icon;

        if (this.el.weatherName) {
            // (제설 필요) 등의 부가 설명이 있더라도 순수 이름만 추출 (예: '맑음', '폭우', '뇌우', '폭설')
            const pureName = (info.name || '맑음').split(' ')[0];
            this.el.weatherName.textContent = pureName;
        }

        if (this.el.weatherTimer) {
            // (위험!), (조치완료) 등의 부가 텍스트 전면 제거
            this.el.weatherTimer.textContent = '';
        }
    }

    // 화면 좌측 긴급 퀘스트 배너 지속 노출
    showEmergencyQuest(weatherType) {
        if (!this.el.emergencyQuestPanel) return;

        let icon = '⚡';
        let title = '[⚡ 긴급: 비상 발전기 가동 (0/1)]';
        let desc = '좌측 상단 비상 발전기 발판에서 가동하세요!';

        if (weatherType === 'snow') {
            icon = '❄️';
            title = '[❄️ 긴급: 도로 제설 작업 (0/1)]';
            desc = '입고 도로 앞 제설 발판에서 눈을 치우세요!';
        } else if (weatherType === 'rain') {
            icon = '🌧️';
            title = '[🌧️ 긴급: 입구 차수판 설치 (0/1)]';
            desc = '서쪽 정문 앞 차수판 발판에서 설치하세요!';
        }

        if (this.el.emergencyQuestIcon) this.el.emergencyQuestIcon.textContent = icon;
        if (this.el.emergencyQuestTitle) this.el.emergencyQuestTitle.textContent = title;
        if (this.el.emergencyQuestDesc) this.el.emergencyQuestDesc.textContent = desc;

        this.el.emergencyQuestPanel.classList.remove('hidden');
    }

    // 긴급 퀘스트 배너 숨기기
    hideEmergencyQuest() {
        if (this.el.emergencyQuestPanel) {
            this.el.emergencyQuestPanel.classList.add('hidden');
        }
    }

    // 출고 트럭 출발 버튼 오버레이 갱신 (대구, 부산, 서울 3개 트럭 및 레거시 대응)
    updateOutboundTruckButton(specificTruck) {
        const updateSingleBtn = (region, truck) => {
            const btn = this.el.outboundDepartBtns ? this.el.outboundDepartBtns[region] : null;
            if (!btn) return;

            // 해당 지역이 해금되었는지 체크
            const isUnlocked = this.game.logistics && this.game.logistics.unlockedRegions && this.game.logistics.unlockedRegions.includes(region);
            if (!isUnlocked || !truck || truck.userData.state !== 'docked') {
                btn.classList.add('hidden');
                return;
            }

            const cargo = truck.userData.cargoList || [];
            let totalCount = 0;
            cargo.forEach(c => totalCount += (c.isPallet ? (c.packageCount || 8) : 1));

            btn.classList.remove('hidden');
            const countEl = btn.querySelector('.cargo-count');
            const labelEl = btn.querySelector('.depart-label');
            if (countEl) countEl.textContent = `${totalCount}개 (${cargo.length}/10)`;

            // 10개 완충 시 2초 자동 출발 카운트다운 표시
            if (cargo.length >= truck.userData.capacity) {
                btn.classList.remove('btn-disabled');
                btn.classList.add('btn-ready', 'btn-full-load');
                const elapsed = truck.userData.autoDepartTimer || 0;
                const remainSec = Math.max(1, Math.ceil(2.0 - elapsed));
                if (labelEl) labelEl.textContent = `⭐ 만차! (${remainSec}초 후 자동출발)`;
            } else if (totalCount >= (GAME_CONFIG.OUTBOUND.MIN_DEPARTURE_COUNT || 5) || cargo.length >= 5) {
                btn.classList.remove('btn-disabled', 'btn-full-load');
                btn.classList.add('btn-ready');
                if (labelEl) labelEl.textContent = '🚚 수동 출발 가능!';
            } else {
                btn.classList.add('btn-disabled');
                btn.classList.remove('btn-ready', 'btn-full-load');
                if (labelEl) labelEl.textContent = `최소 5개 적재 대기`;
            }
        };

        if (specificTruck && specificTruck.userData && specificTruck.userData.region) {
            updateSingleBtn(specificTruck.userData.region, specificTruck);
        } else {
            // 전체 트럭 갱신
            if (this.game.logistics && this.game.logistics.outboundTrucks) {
                ['daegu', 'busan', 'seoul'].forEach(region => {
                    const tr = this.game.logistics.outboundTrucks[region];
                    updateSingleBtn(region, tr);
                });
            }
        }
    }

    // 알바 모달 렌더링
    renderWorkerModal() {
        const wm = this.game.workerManager;
        const state = this.game.state;

        // 1. 고용 카드 3장
        const cardsBox = this.el.workerCardsContainer;
        cardsBox.innerHTML = '';

        wm.availableCards.forEach((card, idx) => {
            if (!card) return;
            const maxCap = wm.getMaxWorkerCount ? wm.getMaxWorkerCount(card.role) : (card.role === 'INSPECTOR' ? (this.game.logistics.getUnlockedRegions().length * 2) : 4);
            const curCount = wm.workers.filter(w => (w.role || (w.userData && w.userData.role)) === card.role).length;
            const isFull = curCount >= maxCap;

            const cardEl = document.createElement('div');
            cardEl.className = 'worker-card' + (card.isVeteran ? ' veteran-card' : '');
            cardEl.innerHTML = `
                <div class="card-badge">${card.isVeteran ? '⭐ 단기 베테랑 (180초)' : '일반 채용'}</div>
                <div class="card-icon">${card.roleIcon}</div>
                <div class="card-name">${card.name}</div>
                <div class="card-role">${card.roleName}</div>
                <div class="card-desc">${card.roleDesc}</div>
                <div class="card-cap ${isFull ? 'cap-full' : ''}">현재 정원: <b>${curCount} / ${maxCap}명</b></div>
                <div class="card-cost">채용비용: <b>${card.cost.toLocaleString()}원</b></div>
                <div class="card-wage">시급: <b>${Math.round(card.wageSec * 60).toLocaleString()}원/분</b></div>
                <button class="btn-hire ${isFull ? 'btn-disabled' : ''}" data-card-idx="${idx}">
                    ${isFull ? '정원 마감' : '채용하기'}
                </button>
            `;

            cardEl.querySelector('.btn-hire').addEventListener('click', () => {
                if (isFull) {
                    this.showNotification(`해당 직종은 현재 정원(${maxCap}명)이 가득 찼습니다!`, '#ef4444');
                    return;
                }
                const success = wm.hireWorker(idx, state);
                if (success) this.renderWorkerModal();
            });

            cardsBox.appendChild(cardEl);
        });

        // 2. 단기 베테랑 전용 채용 그리드 (5개 직종)
        const vetBox = this.el.veteranCardsContainer;
        if (vetBox) {
            vetBox.innerHTML = '';
            const roles = ['UNLOADER', 'SCANNER', 'INSPECTOR', 'CARRIER', 'LOADER'];
            roles.forEach(roleKey => {
                const rData = GAME_CONFIG.WORKER_ROLES[roleKey];
                const maxCap = wm.getMaxWorkerCount ? wm.getMaxWorkerCount(roleKey) : (roleKey === 'INSPECTOR' ? (this.game.logistics.getUnlockedRegions().length * 2) : 4);
                const curCount = wm.workers.filter(w => (w.role || (w.userData && w.userData.role)) === roleKey).length;
                const isFull = curCount >= maxCap;

                const vetCard = document.createElement('div');
                vetCard.className = 'veteran-quick-card';
                vetCard.innerHTML = `
                    <div class="v-icon">${rData.icon}</div>
                    <div class="v-title">${rData.name}</div>
                    <div class="v-desc">180초 / 2배속</div>
                    <div class="card-cap ${isFull ? 'cap-full' : ''}" style="margin: 2px 0; font-size: 10px;">${curCount}/${maxCap}명</div>
                    <div class="v-cost">750원</div>
                    <button class="btn-hire-veteran ${isFull ? 'btn-disabled' : ''}" data-role="${roleKey}">
                        ${isFull ? '마감' : '채용하기'}
                    </button>
                `;

                vetCard.querySelector('.btn-hire-veteran').addEventListener('click', () => {
                    if (isFull) {
                        this.showNotification(`해당 직종은 현재 정원(${maxCap}명)이 가득 찼습니다!`, '#ef4444');
                        return;
                    }
                    const success = wm.hireVeteranWorker(roleKey, state);
                    if (success) this.renderWorkerModal();
                });

                vetBox.appendChild(vetCard);
            });
        }

        // 3. 현재 근무 중인 알바 목록
        const listBox = this.el.activeWorkersList;
        listBox.innerHTML = '';

        if (wm.workers.length === 0) {
            listBox.innerHTML = '<div class="empty-list">현재 고용된 알바가 없습니다.</div>';
        } else {
            wm.workers.forEach(w => {
                const tierInfo = GAME_CONFIG.WORKER_PROFICIENCY[w.proficiencyTier];
                const row = document.createElement('div');
                row.className = 'worker-row';
                row.innerHTML = `
                    <div class="w-info">
                        <span class="w-name">${w.name}</span>
                        <span class="w-role">[${w.roleName}]</span>
                        <span class="w-tier" style="color: ${tierInfo.colorHex}">${tierInfo.name} ${tierInfo.badge}</span>
                        ${w.isVeteran ? `<span class="w-timer">(남은계약: ${Math.ceil(w.veteranTimer)}초)</span>` : ''}
                    </div>
                    <div class="w-wage">${Math.round(w.wageSec * 60).toLocaleString()}원/분</div>
                    <button class="btn-fire" data-worker-id="${w.id}">퇴사</button>
                `;

                row.querySelector('.btn-fire').addEventListener('click', () => {
                    wm.fireWorker(w.id);
                    this.renderWorkerModal();
                });

                listBox.appendChild(row);
            });
        }
    }

    // 업그레이드 모달 렌더링
    renderUpgradeModal() {
        const state = this.game.state;
        const container = document.getElementById('upgrade-cards-container');
        container.innerHTML = '';

        // 1. 플레이어 업그레이드 (이동속도, 소지량, 작업속도)
        const pUpgrades = GAME_CONFIG.PLAYER_UPGRADES;
        Object.keys(pUpgrades).forEach(key => {
            const up = pUpgrades[key];
            const currentLv = state.playerUpgrades[key] || 1;
            const isMax = currentLv >= 5;
            const nextCost = isMax ? 0 : up.costs[currentLv];

            const card = document.createElement('div');
            card.className = 'upgrade-card';
            card.innerHTML = `
                <div class="up-title">🏃 플레이어 - ${up.name} (Lv.${currentLv}/5)</div>
                <div class="up-desc">${up.desc[currentLv - 1]}</div>
                <div class="up-next">${!isMax ? `다음: ${up.desc[currentLv]} (${nextCost.toLocaleString()}원)` : '최고 레벨 달성!'}</div>
                <button class="btn-upgrade ${isMax ? 'btn-disabled' : ''}" data-type="player" data-key="${key}">
                    ${isMax ? 'MAX' : '업그레이드'}
                </button>
            `;

            if (!isMax) {
                card.querySelector('.btn-upgrade').addEventListener('click', () => {
                    this.game.upgradePlayer(key);
                });
            }

            container.appendChild(card);
        });

        // 2. 시설 규모 업그레이드 (작은 창고 -> 중형 물류센터 -> 앙팡 메가허브)
        const currentTier = state.warehouseTier; // 1, 2, 3
        const nextTierData = GAME_CONFIG.WAREHOUSE_TIERS[currentTier]; // 2 또는 3
        const isTierMax = currentTier >= 3;

        const tierCard = document.createElement('div');
        tierCard.className = 'upgrade-card tier-card';
        tierCard.innerHTML = `
            <div class="up-title">🏢 시설 규모: ${GAME_CONFIG.WAREHOUSE_TIERS[currentTier - 1].name}</div>
            <div class="up-desc">${GAME_CONFIG.WAREHOUSE_TIERS[currentTier - 1].desc}</div>
            <div class="up-next">
                ${!isTierMax ? `다음 확장: ${nextTierData.name} (${nextTierData.cost.toLocaleString()}원)` : '최종 단계: 앙팡 메가허브 완성!'}
            </div>
            <button class="btn-upgrade ${isTierMax ? 'btn-disabled' : ''}">
                ${isTierMax ? 'MAX' : '시설 증축하기'}
            </button>
        `;

        if (!isTierMax) {
            tierCard.querySelector('.btn-upgrade').addEventListener('click', () => {
                this.game.upgradeWarehouseTier();
            });
        }
        container.appendChild(tierCard);

        // 3. 지역 확장 (부산, 서울)
        const regionsToUnlock = ['busan', 'seoul'];
        regionsToUnlock.forEach(regKey => {
            const reg = GAME_CONFIG.REGIONS[regKey];
            const isUnlocked = this.game.logistics.unlockedRegions.includes(regKey);

            const regCard = document.createElement('div');
            regCard.className = 'upgrade-card region-card';
            regCard.innerHTML = `
                <div class="up-title">🗺️ 출고 노선 확장: [${reg.name}]</div>
                <div class="up-desc">정산 배율: x${reg.multiplier} (고수익 물량 배정!)</div>
                <div class="up-next">${isUnlocked ? '노선 운행 중' : `해금 비용: ${reg.unlockCost.toLocaleString()}원`}</div>
                <button class="btn-upgrade ${isUnlocked ? 'btn-disabled' : ''}">
                    ${isUnlocked ? '해금 완료' : '노선 해금'}
                </button>
            `;

            if (!isUnlocked) {
                regCard.querySelector('.btn-upgrade').addEventListener('click', () => {
                    this.game.unlockRegion(regKey);
                });
            }
            container.appendChild(regCard);
        });

        // 4. 트럭 배차 간격 단축
        const truckLv = state.truckIntervalLevel;
        const isTruckMax = truckLv >= 5;
        const truckCost = isTruckMax ? 0 : GAME_CONFIG.TRUCK_INTERVAL_UPGRADES.costs[truckLv];

        const truckCard = document.createElement('div');
        truckCard.className = 'upgrade-card';
        truckCard.innerHTML = `
            <div class="up-title">⏱️ 트럭 배차 간격 (Lv.${truckLv}/5)</div>
            <div class="up-desc">현재 쿨타임: ${GAME_CONFIG.INBOUND.INTERVAL_LEVELS[truckLv - 1]}초</div>
            <div class="up-next">${!isTruckMax ? `다음: ${GAME_CONFIG.INBOUND.INTERVAL_LEVELS[truckLv]}초 (${truckCost.toLocaleString()}원)` : '최단 쿨타임 달성'}</div>
            <button class="btn-upgrade ${isTruckMax ? 'btn-disabled' : ''}">
                ${isTruckMax ? 'MAX' : '배차 단축'}
            </button>
        `;

        if (!isTruckMax) {
            truckCard.querySelector('.btn-upgrade').addEventListener('click', () => {
                this.game.upgradeTruckInterval();
            });
        }
        container.appendChild(truckCard);

        // 5. 입고 선반 적재 용량 업그레이드 (10 -> 15 -> 20 -> 30 -> 50)
        const dockLv = state.dockCapacityLevel || 1;
        const dockLevels = GAME_CONFIG.DOCK_CAPACITY_UPGRADES.levels;
        const dockCosts = GAME_CONFIG.DOCK_CAPACITY_UPGRADES.costs;
        const isDockMax = dockLv >= dockLevels.length;
        const dockNextCost = isDockMax ? 0 : dockCosts[dockLv];
        const curCap = dockLevels[dockLv - 1];
        const nextCap = isDockMax ? curCap : dockLevels[dockLv];

        const dockCard = document.createElement('div');
        dockCard.className = 'upgrade-card';
        dockCard.innerHTML = `
            <div class="up-title">📦 입고 선반 적재 용량 (Lv.${dockLv}/${dockLevels.length})</div>
            <div class="up-desc">현재 선반 최대 적재: <b>${curCap}개</b></div>
            <div class="up-next">${!isDockMax ? `다음 확장: ${nextCap}개 (${dockNextCost.toLocaleString()}원)` : '최대 적재 용량 달성!'}</div>
            <button class="btn-upgrade ${isDockMax ? 'btn-disabled' : ''}">
                ${isDockMax ? 'MAX' : '용량 확장'}
            </button>
        `;

        if (!isDockMax) {
            dockCard.querySelector('.btn-upgrade').addEventListener('click', () => {
                this.game.upgradeDockCapacity();
            });
        }
        container.appendChild(dockCard);

        // 6. 출고 선반 적재 용량 업그레이드 (10, 20, 30, 35, 40)
        const outRackLv = state.outboundCapacityLevel || 2;
        const outRackLevels = GAME_CONFIG.OUTBOUND_RACK_CAPACITY_UPGRADES.levels;
        const outRackCosts = GAME_CONFIG.OUTBOUND_RACK_CAPACITY_UPGRADES.costs;
        const isOutRackMax = outRackLv >= outRackLevels.length;
        const outRackNextCost = isOutRackMax ? 0 : outRackCosts[outRackLv];
        const curOutCap = outRackLevels[outRackLv - 1];
        const nextOutCap = isOutRackMax ? curOutCap : outRackLevels[outRackLv];

        const outRackCard = document.createElement('div');
        outRackCard.className = 'upgrade-card';
        outRackCard.innerHTML = `
            <div class="up-title">📦 출고 선반 적재 용량 (Lv.${outRackLv}/${outRackLevels.length})</div>
            <div class="up-desc">현재 선반 최대 적재: <b>${curOutCap}개</b> (층당 10개)</div>
            <div class="up-next">${!isOutRackMax ? `다음 확장: ${nextOutCap}개 (${outRackNextCost.toLocaleString()}원)` : '최대 적재 용량 달성!'}</div>
            <button class="btn-upgrade ${isOutRackMax ? 'btn-disabled' : ''}">
                ${isOutRackMax ? 'MAX' : '선반 층 증축'}
            </button>
        `;

        if (!isOutRackMax) {
            outRackCard.querySelector('.btn-upgrade').addEventListener('click', () => {
                this.game.upgradeOutboundRackCapacity();
            });
        }
        container.appendChild(outRackCard);
    }

    // 알림 토스트 띄우기
    showNotification(message, color = '#ffffff') {
        const toast = this.el.notificationToast;
        toast.textContent = message;
        toast.style.borderColor = color;
        toast.classList.add('show');

        clearTimeout(this.toastTimeout);
        this.toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3200);
    }

    // 앙팡데이 피버 배너 연출
    showFeverBanner(show) {
        if (show) {
            this.el.feverBanner.classList.add('show');
        } else {
            this.el.feverBanner.classList.remove('show');
        }
    }
}

window.GameUI = GameUI;
