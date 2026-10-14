/**
 * 알바(직원) 관리 및 AI 시스템 (workers.js)
 */
class WorkerManager {
    constructor(scene, logistics) {
        this.scene = scene;
        this.logistics = logistics;
        this.workers = [];
        this.availableCards = []; // 현재 고용 가능한 카드 3장
        this.totalWagesPerSec = 0;

        this.generateHireCards();
    }

    // 직종별 마감 여부 확인 헬퍼
    isRoleFull(roleKey) {
        const curCount = this.workers.filter(w => (w.role || (w.userData && w.userData.role)) === roleKey).length;
        const maxCap = this.getMaxWorkerCount(roleKey);
        return curCount >= maxCap;
    }

    // 고용 카드 1장 단품 랜덤 생성 (고용 가능 직종 가중치 부여)
    generateSingleCard(preferAvailable = true) {
        const allRoleKeys = Object.keys(GAME_CONFIG.WORKER_ROLES);
        let roleKey;

        if (preferAvailable) {
            const availableRoles = allRoleKeys.filter(r => !this.isRoleFull(r));
            // 정원이 남은 직종이 있으면 85% 확률로 그 중에서 선택, 없으면 전체 중에서 선택
            if (availableRoles.length > 0 && Math.random() < 0.85) {
                roleKey = availableRoles[Math.floor(Math.random() * availableRoles.length)];
            } else {
                roleKey = allRoleKeys[Math.floor(Math.random() * allRoleKeys.length)];
            }
        } else {
            roleKey = allRoleKeys[Math.floor(Math.random() * allRoleKeys.length)];
        }

        const roleData = GAME_CONFIG.WORKER_ROLES[roleKey];
        const name = GAME_CONFIG.WORKER_NAMES[Math.floor(Math.random() * GAME_CONFIG.WORKER_NAMES.length)];
        return {
            id: 'card_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: name,
            role: roleKey,
            roleName: roleData.name,
            roleDesc: roleData.desc,
            roleIcon: roleData.icon,
            isVeteran: false, // 일반 카드는 100% 정규직 알바
            cost: roleData.hireCost,
            wageSec: roleData.baseWageSec,
        };
    }

    // 마감된 직종을 후순위(뒤 슬롯)로 정렬
    sortAvailableCards() {
        this.availableCards.sort((a, b) => {
            const aFull = this.isRoleFull(a.role) ? 1 : 0;
            const bFull = this.isRoleFull(b.role) ? 1 : 0;
            return aFull - bFull; // 마감 안 된 것(0)이 앞, 마감된 것(1)이 뒤
        });
    }

    // 고용 카드 3장 랜덤 생성 (단기 베테랑은 전용 버튼에서만 채용 가능)
    generateHireCards() {
        this.availableCards = [];
        for (let i = 0; i < 3; i++) {
            this.availableCards.push(this.generateSingleCard(true));
        }
        this.sortAvailableCards();
    }

    // 50원 소모 리롤
    rerollCards(gameState) {
        if (gameState.money < GAME_CONFIG.REROLL_COST) {
            if (window.gameUI) window.gameUI.showNotification('소지금이 부족하여 리롤할 수 없습니다. (필요: 50원)', '#e74c3c');
            return false;
        }

        gameState.money -= GAME_CONFIG.REROLL_COST;
        if (window.soundManager) window.soundManager.playClick();
        this.generateHireCards();
        if (window.gameUI) {
            window.gameUI.showNotification('알바 고용 카드를 새로고침했습니다! (-50원)', '#f39c12');
            window.gameUI.renderWorkerModal();
        }
        return true;
    }

    // [모듈 1] 직종별 최대 정원 계산 (검수 알바는 해금된 검수대 수 * 2 로 동적 계산)
    getMaxWorkerCount(roleKey) {
        if (roleKey === 'INSPECTOR') {
            const unlockedCount = this.logistics ? this.logistics.getUnlockedRegions().length : 1;
            return unlockedCount * 2;
        }
        return GAME_CONFIG.WORKER_ROLES[roleKey] ? GAME_CONFIG.WORKER_ROLES[roleKey].maxCount : 4;
    }

    // 알바 고용 시도
    hireWorker(cardIndex, gameState) {
        const card = this.availableCards[cardIndex];
        if (!card) return false;

        // 고용 비용 확인
        if (gameState.money < card.cost) {
            if (window.gameUI) window.gameUI.showNotification('소지금이 부족합니다!', '#e74c3c');
            return false;
        }

        // 직종별 최대 정원 확인 (검수 알바 동적 정원 반영)
        const currentCount = this.workers.filter(w => w.role === card.role).length;
        const maxCount = this.getMaxWorkerCount(card.role);
        if (currentCount >= maxCount) {
            if (card.role === 'INSPECTOR') {
                if (window.gameUI) window.gameUI.showNotification('해금된 검수대 정원이 가득 찼습니다. 노선을 확장하세요!', '#e74c3c');
            } else {
                if (window.gameUI) window.gameUI.showNotification(`[${card.roleName}] 정원이 가득 찼습니다! (최대 ${maxCount}명)`, '#e74c3c');
            }
            return false;
        }

        // 비용 차감
        gameState.money -= card.cost;
        if (window.soundManager) window.soundManager.playCoin();

        // 3D 메쉬 생성
        const mesh = window.modelFactory.createCharacter(false, card.role);
        // 입고 선반 근처 기본 스폰
        mesh.position.set(-20 + (Math.random() - 0.5) * 4, 0, 0 + (Math.random() - 0.5) * 4);
        this.scene.add(mesh);

        const worker = {
            id: 'worker_' + Date.now(),
            name: card.name,
            role: card.role,
            roleName: card.roleName,
            isVeteran: card.isVeteran,
            veteranTimer: card.isVeteran ? GAME_CONFIG.VETERAN_WORKER.duration : 0,
            workTime: 0,
            proficiencyTier: card.isVeteran ? 3 : 0, // 베테랑은 시작부터 베테랑 등급
            wageSec: card.wageSec,
            mesh: mesh,
            state: 'idle',
            targetPos: new THREE.Vector3(),
            actionTimer: 0,
            assignedStation: null,
            speed: 4.8 * (card.isVeteran ? GAME_CONFIG.VETERAN_WORKER.speedMultiplier : 1.0),
            workSpeed: 1.0 * (card.isVeteran ? GAME_CONFIG.VETERAN_WORKER.workSpeedMultiplier : 1.0),
            inventory: [],
            maxInventory: GAME_CONFIG.WORKER_PROFICIENCY[card.isVeteran ? 3 : 0].maxInventory,
        };

        this.workers.push(worker);

        // [파트 A 1번] 채용한 카드는 즉시 새 랜덤 카드 1장으로 보충하여 항상 3장 유지 및 마감 카드 후순위 정렬
        this.availableCards[cardIndex] = this.generateSingleCard(true);
        this.sortAvailableCards();

        if (window.gameUI) {
            window.gameUI.showNotification(`🎉 [${card.roleName}] ${card.name} 님이 채용되었습니다!`, '#2ecc71');
            window.gameUI.renderWorkerModal();
            window.gameUI.updateHUD();
        }

        return true;
    }

    // 단기 베테랑 알바 전용 즉시 채용 (750원 / 180초간 초고속 가동)
    hireVeteranWorker(roleKey, gameState) {
        const cost = GAME_CONFIG.VETERAN_WORKER.hireCost;
        if (gameState.money < cost) {
            if (window.gameUI) window.gameUI.showNotification('소지금이 부족합니다! (필요: 750원)', '#e74c3c');
            return false;
        }

        const roleData = GAME_CONFIG.WORKER_ROLES[roleKey];
        if (!roleData) return false;

        const currentCount = this.workers.filter(w => w.role === roleKey).length;
        const maxCount = this.getMaxWorkerCount(roleKey);
        if (currentCount >= maxCount) {
            if (roleKey === 'INSPECTOR') {
                if (window.gameUI) window.gameUI.showNotification('해금된 검수대 정원이 가득 찼습니다. 노선을 확장하세요!', '#e74c3c');
            } else {
                if (window.gameUI) window.gameUI.showNotification(`[${roleData.name}] 정원이 가득 찼습니다! (최대 ${maxCount}명)`, '#e74c3c');
            }
            return false;
        }

        gameState.money -= cost;
        if (window.soundManager) window.soundManager.playJackpot();

        const name = GAME_CONFIG.WORKER_NAMES[Math.floor(Math.random() * GAME_CONFIG.WORKER_NAMES.length)];
        const mesh = window.modelFactory.createCharacter(false, roleKey);
        mesh.position.set(-15 + (Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3);
        this.scene.add(mesh);

        const worker = {
            id: 'veteran_' + Date.now(),
            name: name,
            role: roleKey,
            roleName: roleData.name,
            isVeteran: true,
            veteranTimer: GAME_CONFIG.VETERAN_WORKER.duration,
            workTime: 0,
            proficiencyTier: 3, // 베테랑 등급
            wageSec: roleData.baseWageSec * 1.5,
            mesh: mesh,
            state: 'idle',
            targetPos: new THREE.Vector3(),
            actionTimer: 0,
            assignedStation: null,
            speed: 4.8 * GAME_CONFIG.VETERAN_WORKER.speedMultiplier,
            workSpeed: 1.0 * GAME_CONFIG.VETERAN_WORKER.workSpeedMultiplier,
            inventory: [],
            maxInventory: GAME_CONFIG.WORKER_PROFICIENCY[3].maxInventory,
        };

        this.workers.push(worker);

        if (window.gameUI) {
            window.gameUI.showNotification(`⭐ 단기 베테랑 [${roleData.name}] ${name} 님이 합류했습니다! (180초)`, '#f1c40f');
            window.gameUI.renderWorkerModal();
            window.gameUI.updateHUD();
        }

        return true;
    }

    // 알바 해고
    fireWorker(workerId) {
        const idx = this.workers.findIndex(w => w.id === workerId);
        if (idx !== -1) {
            const w = this.workers[idx];
            // [파트 B 9번] 들고 있던 택배 메쉬 및 카트 화물 완전 삭제
            if (w.cart) {
                w.cart.userData.cargoList = [];
                if (w.cart.updateVisual) w.cart.updateVisual();
                w.cart.userData.carrier = null;
                if (w.cart.userData.basePos) w.cart.position.copy(w.cart.userData.basePos);
                w.cart = null;
            }
            if (w.drivingForklift) {
                this.unboardForklift(w, w.drivingForklift);
            }
            if (w.mesh) {
                if (w.mesh.carryStack) {
                    while (w.mesh.carryStack.children.length > 0) {
                        const child = w.mesh.carryStack.children[0];
                        if (child.geometry) child.geometry.dispose();
                        w.mesh.carryStack.remove(child);
                    }
                }
                this.scene.remove(w.mesh);
            }
            w.inventory = [];
            this.workers.splice(idx, 1);
            if (window.gameUI) {
                window.gameUI.showNotification(`${w.name} 님을 퇴사 처리했습니다.`, '#95a5a6');
                window.gameUI.renderWorkerModal();
                window.gameUI.updateHUD();
            }
        }
    }

    // 알바 지게차 탑승
    boardForklift(worker, fork) {
        if (!worker || !fork) return;
        worker.drivingForklift = fork;
        fork.userData.driver = worker;
        worker.isWorker = true;
        fork.userData.aiState = 'moving_to_rack';
        if (worker.mesh) {
            worker.mesh.position.set(fork.position.x, fork.position.y + 0.55, fork.position.z - 0.2);
            worker.mesh.rotation.y = fork.rotation.y;
        }
        if (window.soundManager) window.soundManager.playClick();
    }

    // 알바 지게차 하차
    unboardForklift(worker, fork) {
        if (fork) {
            fork.userData.driver = null;
            fork.userData.aiState = 'idle';
            fork.userData.targetRegion = null;
        }
        if (worker) {
            worker.drivingForklift = null;
            if (worker.mesh && fork) {
                worker.mesh.position.set(fork.position.x - 1.2, 0, fork.position.z);
            }
        }
    }

    // 전체 인건비 계산 (분당 인건비, 야간수당 1.5배 반영)
    calculateLaborCostPerMinute() {
        const isNight = window.game && window.game.state && window.game.state.isNight;
        const nightMult = isNight ? (GAME_CONFIG.NIGHT_SHIFT ? GAME_CONFIG.NIGHT_SHIFT.WAGE_MULTIPLIER : 1.5) : 1.0;
        const perSec = this.workers.reduce((acc, w) => acc + w.wageSec, 0);
        return Math.round(perSec * 60 * nightMult);
    }

    // 업데이트 루프
    update(delta, gameState, weatherManager) {
        const weatherSpeedMult = weatherManager ? weatherManager.getSpeedMultiplier() : 1.0;
        const weatherWorkMult = weatherManager ? weatherManager.getWorkSpeedMultiplier() : 1.0;

        // [모듈 1] 검수 알바 해금 상태 연동 실시간 자동 재분산 및 듀얼 협업 배정
        this.rebalanceInspectors(this.logistics);

        let totalWagesThisFrame = 0;
        const isNight = gameState && gameState.isNight;
        const nightWageMult = isNight ? (GAME_CONFIG.NIGHT_SHIFT ? GAME_CONFIG.NIGHT_SHIFT.WAGE_MULTIPLIER : 1.5) : 1.0;

        for (let i = this.workers.length - 1; i >= 0; i--) {
            const w = this.workers[i];
            
            // 인건비 누적 (야간수당 할증)
            totalWagesThisFrame += w.wageSec * delta * nightWageMult;

            // 근무 시간 및 숙련도 계산
            w.workTime += delta;
            this.updateProficiency(w);

            // [모듈 2] 단기 베테랑 시간 카운트다운 & 3D 바닥 원형 게이지 실시간 갱신
            if (w.isVeteran) {
                w.veteranTimer -= delta;

                // 3D 바닥 게이지 갱신 (180초 기준 비율 및 30초 미만 붉은색 깜빡임)
                if (w.mesh && w.mesh.updateTimerProgress) {
                    w.mesh.updateTimerProgress(w.veteranTimer, GAME_CONFIG.VETERAN_WORKER.duration || 180);
                }

                if (w.veteranTimer <= 0) {
                    // [파트 B 9번] 단기 알바 퇴장 시 운반 중인 택배 및 메쉬 즉시 삭제
                    if (w.cart) {
                        w.cart.userData.cargoList = [];
                        if (w.cart.updateVisual) w.cart.updateVisual();
                        w.cart.userData.carrier = null;
                        if (w.cart.userData.basePos) w.cart.position.copy(w.cart.userData.basePos);
                        w.cart = null;
                    }
                    if (w.mesh) {
                        if (w.mesh.carryStack) {
                            while (w.mesh.carryStack.children.length > 0) {
                                const child = w.mesh.carryStack.children[0];
                                if (child.geometry) child.geometry.dispose();
                                w.mesh.carryStack.remove(child);
                            }
                        }
                        this.scene.remove(w.mesh);
                    }
                    w.inventory = [];
                    // 퇴장
                    this.workers.splice(i, 1);
                    if (window.gameUI) {
                        window.gameUI.showNotification(`⏱️ 단기 베테랑 알바 [${w.name}] 님의 계약이 만료되어 퇴장했습니다.`, '#f39c12');
                        window.gameUI.renderWorkerModal();
                    }
                    continue;
                }
            }

            // AI FSM 행동 로직 실행
            this.updateWorkerAI(w, delta, weatherSpeedMult, weatherWorkMult);
            
            // 걷기 애니메이션
            this.animateWorker(w, delta);

            // [비주얼 안전 동기화] 인벤토리 개수와 씬의 택배 스택 개수 실시간 일치 보장
            if (w.mesh && w.mesh.carryStack && w.mesh.carryStack.children.length !== w.inventory.length) {
                this.updateWorkerStackVisual(w);
            }
        }

        // 인건비 실시간 차감
        if (totalWagesThisFrame > 0) {
            gameState.money = Math.max(0, gameState.money - totalWagesThisFrame);
            gameState.totalLaborCostPaid += totalWagesThisFrame;
        }
    }

    // 숙련도 계산 및 외형 갱신
    updateProficiency(worker) {
        if (worker.isVeteran) return; // 베테랑은 고정

        const tiers = GAME_CONFIG.WORKER_PROFICIENCY;
        let currentTierIdx = 0;
        for (let i = tiers.length - 1; i >= 0; i--) {
            if (worker.workTime >= tiers[i].minSec) {
                currentTierIdx = i;
                break;
            }
        }

        if (worker.proficiencyTier !== currentTierIdx) {
            worker.proficiencyTier = currentTierIdx;
            const tierData = tiers[currentTierIdx];
            worker.speed = 4.8 * tierData.speedMult;
            worker.workSpeed = 1.0 * tierData.workMult;
            worker.maxInventory = tierData.maxInventory;

            // 오라 및 뱃지 색상 변경
            if (worker.mesh.auraMesh) {
                worker.mesh.auraMesh.material.color.set(tierData.colorHex);
            }

            if (window.gameUI) {
                window.gameUI.showNotification(`🎉 [${worker.name}] 알바가 [${tierData.name}] 등급으로 승급! (최대 소지량: ${tierData.maxInventory}개)`, '#f1c40f');
            }
        }
    }

    // 알바 FSM AI 동작 구현
    updateWorkerAI(w, delta, weatherSpeedMult, weatherWorkMult) {
        const log = this.logistics;
        const speed = w.speed * weatherSpeedMult;
        const workSpeed = w.workSpeed * weatherWorkMult;

        switch (w.role) {
            case 'UNLOADER': // 하차 알바: 트럭 하차 발판 -> 선반 올리기 발판
                this.aiUnloader(w, delta, speed, log);
                break;

            case 'SCANNER': // 스캔 알바: 선반 위쪽 스캔 발판 상주
                this.aiScanner(w, delta, speed, workSpeed, log);
                break;

            case 'INSPECTOR': // 검수 알바: 분류대 검수 발판 상주
                this.aiInspector(w, delta, speed, workSpeed, log);
                break;

            case 'CARRIER': // 운반 알바: 선반 스캔완료품 -> 분류대 / 분류대 검수완료품 -> 출고 도크
                this.aiCarrier(w, delta, speed, log);
                break;

            case 'LOADER': // 상차 알바: 출고 도크 -> 배송 트럭
                this.aiLoader(w, delta, speed, log);
                break;
        }
    }

    // 1. 하차 알바 AI (트럭 하차 발판 -> 선반 올리기 발판)
    aiUnloader(w, delta, speed, log) {
        if (!w.unloaderState) {
            w.unloaderState = (w.inventory.length > 0 ? 'unloading' : 'loading');
        }

        const interval = 0.18 / (w.workSpeed || 1.0);

        if (w.unloaderState === 'loading') {
            // 입고 트럭 하차 발판으로 이동
            const padPos = log.pads.truck_unload.position;
            if (this.moveTowards(w, padPos, speed, delta, 0.4)) {
                const truck = log.inboundTruck;
                const canPick = truck.userData.state === 'docked' && 
                                truck.userData.cargoList.length > 0 && 
                                w.inventory.length < w.maxInventory && 
                                log.dockPackages.length < log.inboundDockCapacity;

                if (canPick) {
                    w.actionTimer = (w.actionTimer || 0) + delta;
                    if (w.actionTimer >= interval) {
                        w.actionTimer = 0;
                        const pkg = truck.userData.cargoList.pop();
                        w.inventory.push(pkg);
                        this.updateWorkerStackVisual(w);
                        log.updateInboundTruckCargoVisual();
                        if (window.soundManager) window.soundManager.playPickup();

                        if (w.inventory.length >= w.maxInventory) {
                            w.unloaderState = 'unloading';
                        }
                    }
                } else {
                    w.actionTimer = 0;
                    if (w.inventory.length > 0) {
                        w.unloaderState = 'unloading';
                    }
                }
            } else {
                w.actionTimer = 0;
            }
        } else {
            // 입고 선반 올리기 발판으로 이동
            const padPos = log.pads.dock_put.position;
            if (this.moveTowards(w, padPos, speed, delta, 0.4)) {
                if (w.inventory.length > 0 && log.dockPackages.length < log.inboundDockCapacity) {
                    w.actionTimer = (w.actionTimer || 0) + delta;
                    if (w.actionTimer >= interval) {
                        w.actionTimer = 0;
                        const pkg = w.inventory.pop();
                        log.dockPackages.push(pkg);
                        this.updateWorkerStackVisual(w);
                        log.updateDockVisuals();
                        if (window.soundManager) window.soundManager.playDrop();

                        if (w.inventory.length === 0) {
                            w.unloaderState = 'loading';
                        }
                    }
                } else {
                    w.actionTimer = 0;
                    if (w.inventory.length === 0) {
                        w.unloaderState = 'loading';
                    }
                }
            } else {
                w.actionTimer = 0;
            }
        }
    }

    // 2. 스캔 알바 AI (입고 선반 위쪽 스캔 발판 상주)
    aiScanner(w, delta, speed, workSpeed, log) {
        const pad = log.pads.scan_action;
        const padPos = pad.position;
        const reached = this.moveTowards(w, padPos, speed, delta, 0.3);

        if (reached) {
            // 선반 위에 미스캔 택배가 있는지 확인
            const hasUnscanned = log.dockPackages.some(p => !p.region);
            if (hasUnscanned) {
                w.actionTimer += delta * workSpeed;
                pad.setProgress(w.actionTimer / GAME_CONFIG.PAD.ACTION_DURATION);

                if (w.actionTimer >= GAME_CONFIG.PAD.ACTION_DURATION) {
                    log.processScanTableAction();
                    w.actionTimer = 0;
                    pad.setProgress(0);
                }
            } else {
                w.actionTimer = 0;
                pad.setProgress(0);
            }
        } else {
            w.actionTimer = 0;
        }
    }

    // [모듈 1] 검수 알바 자동 분산, 듀얼 협업 및 노선 해금 연동 자동 재분산 AI
    rebalanceInspectors(log) {
        if (!log) return;
        const unlocked = log.getUnlockedRegions(); // 예: ['daegu'], ['daegu', 'busan'], ['daegu', 'busan', 'seoul']
        const inspectors = this.workers.filter(w => w.role === 'INSPECTOR');
        if (inspectors.length === 0) return;

        // 1순위 (빈자리 채우기): 해금된 검수대에 우선 1명씩 메인 알바 배치
        // 2순위 (보조 협업): 모든 해금 검수대에 1명씩 찼다면 남은 알바는 기존 검수대에 1명씩 보조로 배정 (2인 1조)
        // 신규 노선 해금 시: unlocked 길이가 늘어나면 기존 검수대의 '보조 알바'가 즉시 새 검수대의 메인으로 자동 재분산!
        inspectors.forEach((w, idx) => {
            if (idx < unlocked.length) {
                // 메인 작업자 (Z - 0.4 오프셋)
                const targetReg = unlocked[idx];
                if (w.assignedRegion !== targetReg || w.isAssistant !== false) {
                    w.assignedRegion = targetReg;
                    w.isAssistant = false;
                    w.actionTimer = 0; // 재배치 시 타이머 리셋
                }
            } else {
                // 보조 협업자 (Z + 0.4 오프셋)
                const coopIdx = idx - unlocked.length;
                const targetReg = unlocked[coopIdx % unlocked.length];
                if (w.assignedRegion !== targetReg || w.isAssistant !== true) {
                    w.assignedRegion = targetReg;
                    w.isAssistant = true;
                    w.actionTimer = 0;
                }
            }
        });
    }

    // 3. 검수 알바 AI (듀얼 협업 & 위치 겹침 방지 & +20% 가속 버프)
    aiInspector(w, delta, speed, workSpeed, log) {
        if (!w.assignedRegion) {
            this.rebalanceInspectors(log);
        }

        const table = log.sortingTables[w.assignedRegion];
        if (!table) return;

        const pad = table.pads.inspect;
        const padPos = pad.position;

        // 위치 겹침 방지: 메인 알바는 Z - 0.4, 보조 알바는 Z + 0.4 오프셋에 나란히 서서 일함
        const offsetZ = w.isAssistant ? 0.4 : -0.4;
        const targetPos = padPos.clone().add(new THREE.Vector3(0, 0, offsetZ));
        const reached = this.moveTowards(w, targetPos, speed, delta, 0.25);
        w.reachedTarget = reached;

        // 같은 검수대에 함께 서서 일하는 보조 알바가 있는지 확인 (+20% 검수 가속)
        const hasAssistantCoop = this.workers.some(o => 
            o.role === 'INSPECTOR' && 
            o.id !== w.id && 
            o.assignedRegion === w.assignedRegion && 
            o.isAssistant && 
            o.reachedTarget
        );
        const coopMult = hasAssistantCoop ? 1.2 : 1.0;

        if (reached) {
            if (table.uninspected.length > 0) {
                // 메인 알바가 타이머를 전담하여 진행 (메인 부재 시에는 보조 알바가 단독 진행)
                const isMainWorker = !w.isAssistant;
                const isSoloBackup = w.isAssistant && !this.workers.some(o => o.role === 'INSPECTOR' && o.assignedRegion === w.assignedRegion && !o.isAssistant && o.reachedTarget);

                if (isMainWorker || isSoloBackup) {
                    w.actionTimer += delta * workSpeed * coopMult;
                    pad.setProgress(w.actionTimer / GAME_CONFIG.PAD.ACTION_DURATION);

                    if (w.actionTimer >= GAME_CONFIG.PAD.ACTION_DURATION) {
                        const isVeteran = (w.isVeteran || w.proficiencyTier === 3);
                        log.processSortingInspect(w.assignedRegion, isVeteran);
                        w.actionTimer = 0;
                        pad.setProgress(0);
                    }
                }
            } else {
                w.actionTimer = 0;
                pad.setProgress(0);
            }
        } else {
            w.actionTimer = 0;
        }
    }

    // 4. 운반 알바 AI
    // - [모듈 4] 좌측 하단 주차장 카트 연동 (낱개 최대 8개 대량 운반)
    // - 선반 오른쪽 발판(스캔 완료품) -> 해당 목적지 분류대 왼쪽 발판
    // - 분류대 오른쪽 발판(검수 완료품) -> 출고 도크 / 트럭 직행
    // - [모듈 7-4] 베테랑 검수알바에 의해 복구된 택배는 원래 지역 분류대로 역이동!
    aiCarrier(w, delta, speed, log) {
        // 운반 알바는 하차/상차 알바와 동일하게 손/머리에 직접 택배를 들고 나름 (카트는 플레이어가 사용)
        if (w.cart) {
            w.cart.userData.carrier = null;
            if (w.cart.userData.basePos) w.cart.position.copy(w.cart.userData.basePos);
            w.cart = null;
        }

        if (!w.carrierState) {
            w.carrierState = (w.inventory.length > 0 ? 'delivering' : 'picking');
        }

        const interval = 0.18 / (w.workSpeed || 1.0);

        if (w.carrierState === 'picking') {
            if (w.inventory.length >= w.maxInventory) {
                w.carrierState = 'delivering';
                w.actionTimer = 0;
                return;
            }

            // 현재 픽업할 대상 소스 결정
            let pickType = null;
            let targetRegion = null;

            if (w.inventory.length > 0) {
                // 이미 손에 짐이 있는 경우: 기존에 집던 대상과 동일한 소스에서 추가 픽업 시도
                const first = w.inventory[0];
                if (!first.isInspected) {
                    if (log.dockPackages.some(p => p.region && !p.isInspected)) {
                        pickType = 'dock';
                    }
                } else if (first.recoveredByVeteran) {
                    const r = first.region || 'daegu';
                    const tbl = log.sortingTables[r];
                    if (tbl && tbl.inspected.some(p => p.recoveredByVeteran)) {
                        pickType = 'table_recovered';
                        targetRegion = r;
                    }
                } else {
                    const r = w.pickSourceRegion || first.region || 'daegu';
                    const tbl = log.sortingTables[r];
                    if (tbl && tbl.inspected.length > 0) {
                        pickType = 'table_inspected';
                        targetRegion = r;
                    }
                }

                // 기존 소스에 더 이상 집을 게 없으면 바로 배달로 전환!
                if (!pickType) {
                    w.carrierState = 'delivering';
                    w.actionTimer = 0;
                    return;
                }
            } else {
                // 손이 비어있는 경우 새로 탐색
                const hasScannedInDock = log.dockPackages.some(p => p.region && !p.isInspected);
                if (hasScannedInDock) {
                    pickType = 'dock';
                } else {
                    const unlocked = log.getUnlockedRegions();
                    for (const r of unlocked) {
                        const tbl = log.sortingTables[r];
                        if (tbl && tbl.inspected.some(p => p.recoveredByVeteran)) {
                            pickType = 'table_recovered';
                            targetRegion = r;
                            break;
                        }
                    }

                    if (!pickType) {
                        for (const r of unlocked) {
                            const tbl = log.sortingTables[r];
                            if (tbl && tbl.inspected.length > 0) {
                                pickType = 'table_inspected';
                                targetRegion = r;
                                w.pickSourceRegion = r;
                                break;
                            }
                        }
                    }
                }
            }

            // 집을 게 아무것도 없으면 대기
            if (!pickType) {
                w.actionTimer = 0;
                return;
            }

            // 각 pickType별 이동 및 1개씩 픽업
            if (pickType === 'dock') {
                const padPos = log.pads.dock_take.position;
                if (this.moveTowards(w, padPos, speed, delta, 0.4)) {
                    const scannedIdx = log.dockPackages.findIndex(p => p.region && !p.isInspected);
                    if (scannedIdx !== -1 && w.inventory.length < w.maxInventory) {
                        w.actionTimer = (w.actionTimer || 0) + delta;
                        if (w.actionTimer >= interval) {
                            w.actionTimer = 0;
                            const p = log.dockPackages.splice(scannedIdx, 1)[0];
                            w.inventory.push(p);
                            this.updateWorkerStackVisual(w);
                            log.updateDockVisuals();
                            if (window.soundManager) window.soundManager.playPickup();

                            if (w.inventory.length >= w.maxInventory) {
                                w.carrierState = 'delivering';
                            }
                        }
                    } else {
                        w.actionTimer = 0;
                        if (w.inventory.length > 0) {
                            w.carrierState = 'delivering';
                        }
                    }
                } else {
                    w.actionTimer = 0;
                }
            } else if (pickType === 'table_recovered') {
                const tbl = log.sortingTables[targetRegion];
                const padPos = tbl ? tbl.pads.take.position : null;
                if (padPos && this.moveTowards(w, padPos, speed, delta, 0.4)) {
                    const recIdx = tbl.inspected.findIndex(p => p.recoveredByVeteran);
                    if (recIdx !== -1 && w.inventory.length < w.maxInventory) {
                        w.actionTimer = (w.actionTimer || 0) + delta;
                        if (w.actionTimer >= interval) {
                            w.actionTimer = 0;
                            const p = tbl.inspected.splice(recIdx, 1)[0];
                            w.inventory.push(p);
                            this.updateWorkerStackVisual(w);
                            log.updateSortingVisuals(targetRegion);
                            if (window.soundManager) window.soundManager.playPickup();

                            if (w.inventory.length >= w.maxInventory) {
                                w.carrierState = 'delivering';
                            }
                        }
                    } else {
                        w.actionTimer = 0;
                        if (w.inventory.length > 0) {
                            w.carrierState = 'delivering';
                        }
                    }
                } else {
                    w.actionTimer = 0;
                }
            } else if (pickType === 'table_inspected') {
                const tbl = log.sortingTables[targetRegion];
                const padPos = tbl ? tbl.pads.take.position : null;
                if (padPos && this.moveTowards(w, padPos, speed, delta, 0.4)) {
                    if (tbl.inspected.length > 0 && w.inventory.length < w.maxInventory) {
                        w.actionTimer = (w.actionTimer || 0) + delta;
                        if (w.actionTimer >= interval) {
                            w.actionTimer = 0;
                            const p = tbl.inspected.pop();
                            w.inventory.push(p);
                            this.updateWorkerStackVisual(w);
                            log.updateSortingVisuals(targetRegion);
                            if (window.soundManager) window.soundManager.playPickup();

                            if (w.inventory.length >= w.maxInventory) {
                                w.carrierState = 'delivering';
                            }
                        }
                    } else {
                        w.actionTimer = 0;
                        if (w.inventory.length > 0) {
                            w.carrierState = 'delivering';
                        }
                    }
                } else {
                    w.actionTimer = 0;
                }
            }
        } else {
            // delivering 상태: 손에 든 택배를 목적지에 1개씩 내려놓기
            if (w.inventory.length === 0) {
                w.carrierState = 'picking';
                w.actionTimer = 0;
                return;
            }

            const firstPkg = w.inventory[0];
            if (!firstPkg.isInspected) {
                // 미검수 택배 또는 베테랑 복구 택배: 해당 택배의 본래 지역 분류대 투입구로 이동 (역이동 포함)
                const targetRegion = firstPkg.region || 'daegu';
                const tbl = log.sortingTables[targetRegion];
                if (tbl) {
                    const padPos = tbl.pads.put.position;
                    if (this.moveTowards(w, padPos, speed, delta, 0.4)) {
                        const matchIdx = w.inventory.findIndex(p => p.region === targetRegion);
                        if (matchIdx !== -1) {
                            w.actionTimer = (w.actionTimer || 0) + delta;
                            if (w.actionTimer >= interval) {
                                w.actionTimer = 0;
                                const p = w.inventory.splice(matchIdx, 1)[0];
                                p.recoveredByVeteran = false;
                                tbl.uninspected.push(p);
                                this.updateWorkerStackVisual(w);
                                log.updateSortingVisuals(targetRegion);
                                if (window.soundManager) window.soundManager.playDrop();

                                if (w.inventory.length === 0) {
                                    w.carrierState = 'picking';
                                }
                            }
                        } else {
                            w.actionTimer = 0;
                            if (w.inventory.length === 0) {
                                w.carrierState = 'picking';
                            }
                        }
                    } else {
                        w.actionTimer = 0;
                    }
                }
            } else {
                // 검수 완료품 목적지 판단 (지역별 전용 출고 트럭 직행 vs 지역별 출고 렉 선반 보관)
                const targetRegion = firstPkg.region || 'daegu';
                const targetTruck = log.outboundTrucks[targetRegion] || log.outboundTrucks.daegu;
                const loadPad = log.pads[`outbound_truck_load_${targetRegion}`] || log.pads.outbound_truck_load;
                // [모듈 3] 선반에 보관할 때는 반드시 좌측 [도크 두기] 발판 이용
                const dockPutPad = log.pads[`outbound_dock_put_${targetRegion}`] || log.pads[`outbound_dock_${targetRegion}`];

                // 오분류 택배는 트럭 직행 상차 금지 -> 해당 지역 출고 렉 선반에 보관!
                const hasMissorted = w.inventory.some(p => p.isMissorted);
                const canDirectLoad = !hasMissorted && targetTruck && (targetTruck.userData.state === 'docked' && targetTruck.userData.cargoList.length < targetTruck.userData.capacity);

                if (canDirectLoad && loadPad) {
                    // 조건 A (트럭 직행): 해당 지역 트럭 상차 발판으로 직행 상차!
                    if (this.moveTowards(w, loadPad.position, speed, delta, 0.6)) {
                        const matchIdx = w.inventory.findIndex(p => p.region === targetRegion && !p.isMissorted);
                        if (matchIdx !== -1 && targetTruck.userData.state === 'docked' && targetTruck.userData.cargoList.length < targetTruck.userData.capacity) {
                            w.actionTimer = (w.actionTimer || 0) + delta;
                            if (w.actionTimer >= interval) {
                                w.actionTimer = 0;
                                const p = w.inventory.splice(matchIdx, 1)[0];
                                targetTruck.userData.cargoList.push(p);
                                this.updateWorkerStackVisual(w);
                                log.updateOutboundTruckCargoVisual(targetRegion);
                                if (window.soundManager) window.soundManager.playDrop();
                                if (window.gameUI) {
                                    window.gameUI.updateOutboundTruckButton(targetTruck);
                                    window.gameUI.updateHUD();
                                }

                                if (w.inventory.length === 0) {
                                    w.carrierState = 'picking';
                                }
                            }
                        } else {
                            w.actionTimer = 0;
                            if (w.inventory.length === 0) {
                                w.carrierState = 'picking';
                            }
                        }
                    } else {
                        w.actionTimer = 0;
                    }
                } else if (dockPutPad) {
                    // 조건 B (선반 보관): 트럭 부재 중/만차/오분류 시 좌측 두기 발판에 내려놓기
                    if (this.moveTowards(w, dockPutPad.position, speed, delta, 0.4)) {
                        const dockPkgs = log.outboundPackages[targetRegion] || log.outboundPackages.daegu;
                        const maxCap = log.outboundRackCapacity || 20;

                        if (w.inventory.length > 0 && dockPkgs.length < maxCap) {
                            w.actionTimer = (w.actionTimer || 0) + delta;
                            if (w.actionTimer >= interval) {
                                w.actionTimer = 0;
                                const p = w.inventory.pop();
                                dockPkgs.push(p);
                                this.updateWorkerStackVisual(w);
                                log.updateOutboundVisuals(targetRegion);
                                if (window.soundManager) window.soundManager.playDrop();

                                if (w.inventory.length === 0) {
                                    w.carrierState = 'picking';
                                }
                            }
                        } else {
                            w.actionTimer = 0;
                            if (w.inventory.length === 0) {
                                w.carrierState = 'picking';
                            }
                        }
                    } else {
                        w.actionTimer = 0;
                    }
                }
            }
        }
    }

    // 5. 상차 알바 AI (지게차 우선 탑승 및 지역별 트럭 적재 전담)
    aiLoader(w, delta, speed, log) {
        // 이미 지게차를 운전 중인 경우: updateAutonomousForklifts에서 지게차 FSM(이동/적재)을 수행 중이므로 별도 보행 스킵
        if (w.drivingForklift) {
            return;
        }

        const interval = 0.18 / (w.workSpeed || 1.0);

        // 1. [지게차 우선 사용 룰]: 
        // 메가허브(3단계) 해금 & 비어있는 지게차가 있을 때, 출고 렉에 정상 택배 8개 이상이 쌓여있다면
        // 알바는 '택배 먼저 상차하지 않고' 지게차에 우선 탑승하여 8개 파렛트 상차를 수행!
        const tier = (window.game && window.game.state) ? window.game.state.warehouseTier : 1;
        const availableFork = (tier >= 3 && log.forklifts) ? log.forklifts.find(f => f.visible && !f.userData.driver) : null;

        let bulkRegion = null;
        if (availableFork) {
            const unlocked = log.getUnlockedRegions();
            for (const r of unlocked) {
                const dockList = log.outboundPackages[r] || [];
                const normalCount = dockList.filter(p => !p.isMissorted).length;
                const trk = log.outboundTrucks[r];
                if (normalCount >= 8 && trk && trk.userData.state === 'docked' && trk.userData.cargoList.length < trk.userData.capacity) {
                    bulkRegion = r;
                    break;
                }
            }
        }

        if (bulkRegion && availableFork) {
            // 손에 든 물건이 있다면 먼저 도크에 1개씩 내려놓고 지게차 탑승
            if (w.inventory.length > 0) {
                const putPad = log.pads[`outbound_dock_put_${bulkRegion}`] || log.pads[`outbound_dock_${bulkRegion}`];
                if (putPad && this.moveTowards(w, putPad.position, speed, delta, 0.4)) {
                    w.actionTimer = (w.actionTimer || 0) + delta;
                    if (w.actionTimer >= interval) {
                        w.actionTimer = 0;
                        const dockPkgs = log.outboundPackages[bulkRegion] || log.outboundPackages.daegu;
                        dockPkgs.push(w.inventory.pop());
                        this.updateWorkerStackVisual(w);
                        log.updateOutboundVisuals(bulkRegion);
                        if (window.soundManager) window.soundManager.playDrop();
                    }
                } else {
                    w.actionTimer = 0;
                }
                return;
            }

            w.actionTimer = 0;
            // 지게차로 걸어가서 탑승! (택배를 먼저 상차하지 않고 지게차 우선 사용)
            if (this.moveTowards(w, availableFork.position, speed, delta, 1.2)) {
                this.boardForklift(w, availableFork);
                availableFork.userData.targetRegion = bulkRegion;
            }
            return;
        }

        // 2. [8개 미만 또는 지게차 부재 시]: 일반 손 상차 로직 수행
        if (!w.loaderState) {
            w.loaderState = (w.inventory.length > 0 ? 'loading' : 'picking');
        }

        // 손에 든 물건의 목적지 지역 확인
        const firstPkg = w.inventory.length > 0 ? w.inventory[0] : null;
        const targetRegion = firstPkg ? (firstPkg.region || 'daegu') : (w.assignedTruckRegion || 'daegu');
        const truck = log.outboundTrucks[targetRegion] || log.outboundTrucks.daegu;
        const isTruckDepartingOrAway = !truck || (truck.userData.state === 'departing' || truck.userData.state === 'away');

        // 예외 대응: 트럭이 적재 도중 출발 시 해당 완충 도크로 안전 반환 처리
        if (w.inventory.length > 0 && isTruckDepartingOrAway) {
            const putPad = log.pads[`outbound_dock_put_${targetRegion}`] || log.pads[`outbound_dock_${targetRegion}`];
            if (putPad && this.moveTowards(w, putPad.position, speed, delta, 0.4)) {
                w.actionTimer = (w.actionTimer || 0) + delta;
                if (w.actionTimer >= interval) {
                    w.actionTimer = 0;
                    const dockPkgs = log.outboundPackages[targetRegion] || log.outboundPackages.daegu;
                    const p = w.inventory.pop();
                    dockPkgs.push(p);
                    this.updateWorkerStackVisual(w);
                    log.updateOutboundVisuals(targetRegion);
                    if (window.soundManager) window.soundManager.playDrop();

                    if (w.inventory.length === 0) {
                        w.loaderState = 'picking';
                    }
                }
            } else {
                w.actionTimer = 0;
            }
            return;
        }

        // 손이 비어있거나 픽업 중일 때
        if (w.loaderState === 'picking') {
            if (w.inventory.length >= w.maxInventory) {
                w.loaderState = 'loading';
                w.actionTimer = 0;
                return;
            }

            const unlocked = log.getUnlockedRegions();
            let chosenRegion = w.assignedTruckRegion;
            const chosenDockList = chosenRegion ? (log.outboundPackages[chosenRegion] || []) : [];
            const chosenTrk = chosenRegion ? log.outboundTrucks[chosenRegion] : null;

            // 이미 정해진 chosenRegion의 도크에 더 이상 정상 택배가 없거나 트럭이 만차면 새 chosenRegion 탐색
            if (!chosenRegion || !chosenDockList.some(p => !p.isMissorted) || !chosenTrk || chosenTrk.userData.state !== 'docked' || chosenTrk.userData.cargoList.length >= chosenTrk.userData.capacity) {
                chosenRegion = null;
                for (const r of unlocked) {
                    const trk = log.outboundTrucks[r];
                    const dockList = log.outboundPackages[r] || [];
                    const hasNormal = dockList.some(p => !p.isMissorted);
                    if (trk && trk.userData.state === 'docked' && trk.userData.cargoList.length < trk.userData.capacity && hasNormal) {
                        chosenRegion = r;
                        break;
                    }
                }
            }

            if (chosenRegion) {
                // 선반에서 정상 상자를 꺼낼 때는 우측 [도크 꺼내기] 발판 이용
                const takePad = log.pads[`outbound_dock_take_${chosenRegion}`] || log.pads[`outbound_dock_${chosenRegion}`];
                if (takePad && this.moveTowards(w, takePad.position, speed, delta, 0.4)) {
                    const dockList = log.outboundPackages[chosenRegion] || [];
                    const normalIdx = dockList.findIndex(p => !p.isMissorted);

                    if (normalIdx !== -1 && w.inventory.length < w.maxInventory) {
                        w.actionTimer = (w.actionTimer || 0) + delta;
                        if (w.actionTimer >= interval) {
                            w.actionTimer = 0;
                            const p = dockList.splice(normalIdx, 1)[0];
                            w.inventory.push(p);
                            w.assignedTruckRegion = chosenRegion;
                            this.updateWorkerStackVisual(w);
                            log.updateOutboundVisuals(chosenRegion);
                            if (window.soundManager) window.soundManager.playPickup();

                            if (w.inventory.length >= w.maxInventory) {
                                w.loaderState = 'loading';
                            }
                        }
                    } else {
                        w.actionTimer = 0;
                        if (w.inventory.length > 0) {
                            w.loaderState = 'loading';
                        }
                    }
                } else {
                    w.actionTimer = 0;
                }
            } else {
                w.actionTimer = 0;
                if (w.inventory.length > 0) {
                    w.loaderState = 'loading';
                }
            }
        } else {
            // 손에 든 물건을 해당 지역 트럭 상차 발판으로 운반하여 상차
            const loadPad = log.pads[`outbound_truck_load_${targetRegion}`] || log.pads.outbound_truck_load;
            if (loadPad && this.moveTowards(w, loadPad.position, speed, delta, 0.6)) {
                if (truck && truck.userData.state === 'docked' && truck.userData.cargoList.length < truck.userData.capacity && w.inventory.length > 0) {
                    w.actionTimer = (w.actionTimer || 0) + delta;
                    if (w.actionTimer >= interval) {
                        w.actionTimer = 0;
                        const p = w.inventory.pop();
                        truck.userData.cargoList.push(p);
                        this.updateWorkerStackVisual(w);
                        log.updateOutboundTruckCargoVisual(targetRegion);
                        if (window.soundManager) window.soundManager.playDrop();
                        if (window.gameUI) {
                            window.gameUI.updateOutboundTruckButton(truck);
                            window.gameUI.updateHUD();
                        }

                        if (w.inventory.length === 0) {
                            w.loaderState = 'picking';
                        }
                    }
                } else {
                    w.actionTimer = 0;
                    if (w.inventory.length === 0) {
                        w.loaderState = 'picking';
                    }
                }
            } else {
                w.actionTimer = 0;
            }
        }
    }

    // 캐릭터 이동 유틸리티
    moveTowards(worker, targetVec3, speed, delta, arriveDist = 0.3) {
        const mesh = worker.mesh;
        const currentPos = mesh.position;
        const diffX = targetVec3.x - currentPos.x;
        const diffZ = targetVec3.z - currentPos.z;
        const dist = Math.sqrt(diffX * diffX + diffZ * diffZ);

        if (dist <= arriveDist) {
            return true;
        }

        const moveStep = Math.min(dist, speed * delta);
        mesh.position.x += (diffX / dist) * moveStep;
        mesh.position.z += (diffZ / dist) * moveStep;

        // 회전 (이동 방향 바라보기)
        mesh.rotation.y = Math.atan2(diffX, diffZ);
        worker.isWalking = true;
        return false;
    }

    // 걷기 다리 애니메이션
    animateWorker(worker, delta) {
        const mesh = worker.mesh;
        if (worker.isWalking) {
            worker.walkCycle = (worker.walkCycle || 0) + delta * 10;
            const swing = Math.sin(worker.walkCycle) * 0.35;
            if (mesh.leftLeg) mesh.leftLeg.rotation.x = swing;
            if (mesh.rightLeg) mesh.rightLeg.rotation.x = -swing;
            worker.isWalking = false;
        } else {
            if (mesh.leftLeg) mesh.leftLeg.rotation.x = 0;
            if (mesh.rightLeg) mesh.rightLeg.rotation.x = 0;
        }
    }

    // 알바 손에 든 택배 시각화 갱신 (든 개수만큼 실제 씬에서 택배 박스 탑 생성)
    updateWorkerStackVisual(worker) {
        if (!worker || !worker.mesh || !worker.mesh.carryStack) return;

        const stack = worker.mesh.carryStack;
        while (stack.children.length > 0) {
            const child = stack.children[0];
            if (child.geometry) child.geometry.dispose();
            stack.remove(child);
        }

        worker.inventory.forEach((item, idx) => {
            if (item.isPallet) {
                const pallet = window.modelFactory.createPallet(item.region, true);
                pallet.scale.set(0.65, 0.65, 0.65);
                pallet.position.set(0, idx * 0.8, 0);
                stack.add(pallet);
            } else {
                const box = window.modelFactory.createPackageBox(
                    item.region, 
                    item.isInspected, 
                    item.isMissorted || false, 
                    item.missortTruckPassCount || 0
                );
                box.position.set(0, idx * 0.48, 0);
                stack.add(box);
            }
        });

        // 카트를 끌고 있는 경우 카트 적재함 비주얼도 함께 동기화
        if (worker.cart) {
            worker.cart.userData.cargoList = worker.inventory;
            if (worker.cart.updateVisual) {
                worker.cart.updateVisual();
            }
        }
    }
}

window.WorkerManager = WorkerManager;
