/**
 * 앙팡 로지스틱스 시뮬레이터 메인 게임 엔진 (game.js)
 */
class LogisticsGame {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.width = window.innerWidth;
        this.height = window.innerHeight;

        // 게임 상태 데이터
        this.state = {
            money: GAME_CONFIG.INITIAL.MONEY,
            reputation: GAME_CONFIG.INITIAL.REPUTATION,
            currentDay: 1,
            dayTimer: 0,
            isPaused: false,

            // 업그레이드 레벨
            playerUpgrades: {
                SPEED: 1,
                CAPACITY: 1,
                WORK_SPEED: 1,
            },
            warehouseTier: 1,
            truckIntervalLevel: 1,
            dockCapacityLevel: 1,
            outboundCapacityLevel: 2, // 출고 선반 기본 용량 20개 (Lv.2)
            conveyorLevel: 1,

            // 피버타임 (앙팡데이)
            isFeverTime: false,
            feverTimeRemaining: 0,
            feverCooldownRemaining: 0,

            // 경제 통계
            totalRevenueEarned: 0,
            totalLaborCostPaid: 0,
            totalShippedPackages: 0,
            recentRevenuePerMin: 0,
            revenueHistory: [], // 최근 60초간의 매출 기록
        };

        // 입력 상태
        this.keys = {};
        this.mouseTarget = null;
        this.raycaster = new THREE.Raycaster();
        this.mouseVec = new THREE.Vector2();

        // 발판 인터랙션 타이머
        this.currentActivePad = null;
        this.padTimer = 0;

        this.initThree();
        this.initWorldEnvironment();
        this.initEntities();
        this.initControls();
        this.initLoop();
    }

    initThree() {
        // 씬 생성
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xdce7f0);
        this.scene.fog = new THREE.FogExp2(0xdce7f0, 0.012);

        // 직교/원근 카메라 (쿼터뷰 타이쿤 뷰)
        const aspect = this.width / this.height;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.camera.position.set(0, 32, 28);
        this.camera.lookAt(0, 0, 0);

        // 렌더러
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // OrbitControls (마우스 우클릭 드래그로 자유 회전/줌 지원)
        if (window.THREE && THREE.OrbitControls) {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.maxPolarAngle = Math.PI / 2.1; // 바닥 밑으로 못 내려감
            this.controls.minDistance = 15;
            this.controls.maxDistance = 80;
            this.controls.target.set(0, 0, 0);
            this.controls.mouseButtons = {
                LEFT: THREE.MOUSE.NONE, // 좌클릭은 이동에 양보
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.ROTATE
            };
        }

        window.addEventListener('resize', () => this.onWindowResize());
    }

    initWorldEnvironment() {
        // 기획: 실내 천장 조명(Point Light)은 24시간 밝기 유지, 실외 조명(Directional Light)만 주야간 밝기 변화!
        
        // 실외 태양광 (Directional Light)
        this.sunLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
        this.sunLight.position.set(30, 50, 20);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 10;
        this.sunLight.shadow.camera.far = 130;
        const d = 45;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.scene.add(this.sunLight);

        // 환경광 (기본 앰비언스)
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        this.scene.add(this.ambientLight);

        // 실내 전용 24시간 천장 조명 (Point Light 군집: 카메라 뷰 가리는 천장 메쉬는 렌더링하지 않음)
        this.indoorLights = [];
        const indoorLightPositions = [
            [-15, 12, 0],   // 통합 입고 선반 & 스캔 위
            [0, 12, -8],    // 대구 분류대 위
            [0, 12, 0],     // 부산 분류대 위
            [0, 12, 8],     // 서울 분류대 위
            [12, 12, 0]     // 출고 도크 위
        ];

        indoorLightPositions.forEach(pos => {
            const light = new THREE.PointLight(0xfffaed, 1.1, 32);
            light.position.set(pos[0], pos[1], pos[2]);
            this.scene.add(light);
            this.indoorLights.push(light);
        });

        // [모듈 2] 뇌우 정전용 어두운 붉은색 비상등 (Dark Red Emergency Light)
        this.emergencyLight = new THREE.PointLight(0xff1100, 0, 45);
        this.emergencyLight.position.set(0, 10, 0);
        this.scene.add(this.emergencyLight);

        // ==========================================
        // 바닥 구축 (실외 아스팔트 & 실내 에폭시 바닥)
        // 축소된 아담한 창고 규격: 가로 폭 42 (X = -21 ~ 21), 세로 폭 28 (Z = -14 ~ 14)
        // ==========================================
        // 1. 실외 도로 바닥 (아스팔트 다크그레이)
        const outdoorGeo = new THREE.PlaneGeometry(120, 90);
        outdoorGeo.rotateX(-Math.PI / 2);
        const outdoorMat = new THREE.MeshLambertMaterial({ color: 0x2b303a });
        const outdoorFloor = new THREE.Mesh(outdoorGeo, outdoorMat);
        outdoorFloor.position.y = -0.05;
        outdoorFloor.receiveShadow = true;
        this.scene.add(outdoorFloor);
        this.outdoorFloor = outdoorFloor;

        // 2. 실내 물류센터 에폭시 바닥 (가로 폭 42, 세로 폭 28)
        const indoorGeo = new THREE.PlaneGeometry(42, 28);
        indoorGeo.rotateX(-Math.PI / 2);
        const indoorMat = new THREE.MeshLambertMaterial({ color: 0x3d7068 });
        const indoorFloor = new THREE.Mesh(indoorGeo, indoorMat);
        indoorFloor.position.set(0, 0.0, 0);
        indoorFloor.receiveShadow = true;
        this.scene.add(indoorFloor);

        // 3. 실내 안전 통로 노란 라인
        const lineGeo = new THREE.PlaneGeometry(41.6, 27.6);
        lineGeo.rotateX(-Math.PI / 2);
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, wireframe: true });
        const borderLine = new THREE.Mesh(lineGeo, lineMat);
        borderLine.position.set(0, 0.02, 0);
        this.scene.add(borderLine);

        // 4. 벽체 프레임 (창고 벽 및 셔터 출입문)
        this.createWarehouseWalls();
    }

    createWarehouseWalls() {
        const wallMat = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });
        const wallH = 6.0;

        // 북쪽 벽 (가로 42, Z = -14)
        const northWallGeo = new THREE.BoxGeometry(42, wallH, 0.6);
        const northWall = new THREE.Mesh(northWallGeo, wallMat);
        northWall.position.set(0, wallH / 2, -14);
        northWall.castShadow = true;
        northWall.receiveShadow = true;
        this.scene.add(northWall);

        // 남쪽 벽 (가로 42, Z = 14)
        const southWallGeo = new THREE.BoxGeometry(42, wallH, 0.6);
        const southWall = new THREE.Mesh(southWallGeo, wallMat);
        southWall.position.set(0, wallH / 2, 14);
        southWall.castShadow = true;
        southWall.receiveShadow = true;
        this.scene.add(southWall);

        // 서쪽 벽 (입고 도크 쪽, 중앙 출입구 개방: X = -21)
        const westWallPart1 = new THREE.Mesh(new THREE.BoxGeometry(0.6, wallH, 9), wallMat);
        westWallPart1.position.set(-21, wallH / 2, -9.5);
        const westWallPart2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, wallH, 9), wallMat);
        westWallPart2.position.set(-21, wallH / 2, 9.5);
        this.scene.add(westWallPart1);
        this.scene.add(westWallPart2);

        // 동쪽 벽 (출고 차량/도크 쪽): 출고차량 시야 및 상차 접근 편의를 위해 전면 개방 (벽 제거)
    }

    initEntities() {
        // 날씨 시스템
        this.weatherManager = new window.WeatherManager(this.scene);

        // 물류 시스템
        this.logistics = new window.LogisticsSystem(this.scene);
        const initOutCap = GAME_CONFIG.OUTBOUND_RACK_CAPACITY_UPGRADES.levels[this.state.outboundCapacityLevel - 1];
        this.logistics.setOutboundRackCapacity(initOutCap);

        // 알바생 시스템
        this.workerManager = new window.WorkerManager(this.scene, this.logistics);

        // 긴급 발판 참조 연결
        this.weatherManager.emergencyPads.snow = this.logistics.pads.emergency_snow;
        this.weatherManager.emergencyPads.rain = this.logistics.pads.emergency_rain;
        this.weatherManager.emergencyPads.thunder = this.logistics.pads.emergency_thunder;

        // 플레이어 캐릭터 생성 (입고 선반 앞 스폰: X = -16, Z = 0)
        this.player = window.modelFactory.createCharacter(true, null);
        // [파트 A 3번] 플레이어 초기 maxInventory를 4개로 엄격 고정
        this.player.userData.maxInventory = GAME_CONFIG.PLAYER_UPGRADES.CAPACITY.levels[0];
        this.player.position.set(-16, 0, 0);
        this.scene.add(this.player);

        // UI 매니저 생성
        window.gameUI = new window.GameUI(this);
    }

    initControls() {
        // [파트 B 7번] 가상 조이스틱 상태 변수
        this.isJoystickActive = false;
        this.joystickStart = { x: 0, y: 0 };
        this.joystickVector = { x: 0, z: 0 };
        this.playerCart = null; // 플레이어가 밀고 있는 운반 카트

        const joyBase = document.getElementById('virtual-joystick-base');
        const joyKnob = document.getElementById('virtual-joystick-knob');

        // 키보드 입력
        window.addEventListener('keydown', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = true;
            this.mouseTarget = null; // 키보드 입력 시 마우스 목표 초기화

            // E 키: 지게차 / 카트 탑승 / 하차 토글
            if (key === 'e') {
                this.toggleVehicleRide();
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        // 캔버스 마우스/터치 가상 조이스틱 드래그 조작계 (파트 B 7번)
        const onPointerDown = (e) => {
            if (e.button !== undefined && e.button !== 0) return; // 좌클릭만 처리
            if (this.state.isPaused) return;

            this.isJoystickActive = true;
            this.joystickStart = { x: e.clientX, y: e.clientY };
            this.joystickVector = { x: 0, z: 0 };

            if (joyBase && joyKnob) {
                joyBase.style.left = e.clientX + 'px';
                joyBase.style.top = e.clientY + 'px';
                joyBase.style.display = 'block';

                joyKnob.style.left = e.clientX + 'px';
                joyKnob.style.top = e.clientY + 'px';
                joyKnob.style.display = 'block';
            }
        };

        const onPointerMove = (e) => {
            if (!this.isJoystickActive) return;

            const dx = e.clientX - this.joystickStart.x;
            const dy = e.clientY - this.joystickStart.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxRadius = 40; // 조이스틱 최대 드래그 반경

            const clampedDist = Math.min(dist, maxRadius);
            const angle = Math.atan2(dy, dx);
            const knobX = this.joystickStart.x + Math.cos(angle) * clampedDist;
            const knobY = this.joystickStart.y + Math.sin(angle) * clampedDist;

            if (joyKnob) {
                joyKnob.style.left = knobX + 'px';
                joyKnob.style.top = knobY + 'px';
            }

            // 데드존(6px) 이상 드래그 시 이동 벡터 생성
            if (dist > 6) {
                const intensity = Math.min(1.0, (dist - 6) / (maxRadius - 6));
                // 3D 창고 매핑: 화면 X+ -> 3D X+, 화면 Y- -> 3D Z- (북쪽), 화면 Y+ -> 3D Z+ (남쪽)
                this.joystickVector.x = (dx / dist) * intensity;
                this.joystickVector.z = (dy / dist) * intensity;
            } else {
                this.joystickVector.x = 0;
                this.joystickVector.z = 0;
            }
        };

        const onPointerUp = () => {
            this.isJoystickActive = false;
            this.joystickVector = { x: 0, z: 0 };
            if (joyBase && joyKnob) {
                joyBase.style.display = 'none';
                joyKnob.style.display = 'none';
            }
        };

        this.container.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }

    onWindowResize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.camera.aspect = this.width / this.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.width, this.height);
    }

    setPause(pause) {
        this.state.isPaused = pause;
    }

    // 앙팡데이 피버타임 발동 (300초간 배차 간격 50% 단축 & 수익 2배)
    triggerFeverTime() {
        if (this.state.isFeverTime || this.state.feverCooldownRemaining > 0) return;

        this.state.isFeverTime = true;
        this.state.feverTimeRemaining = GAME_CONFIG.FEVER_TIME.DURATION;
        if (window.soundManager) window.soundManager.playFever();

        if (window.gameUI) {
            window.gameUI.showNotification('🔥 앙팡데이 피버타임 시작! 300초간 배차 간격 50% 단축 및 수익 2배!', '#f39c12');
            window.gameUI.showFeverBanner(true);
            window.gameUI.updateHUD();
        }
    }

    // 플레이어 업그레이드
    upgradePlayer(upgradeKey) {
        const upData = GAME_CONFIG.PLAYER_UPGRADES[upgradeKey];
        const currentLv = this.state.playerUpgrades[upgradeKey] || 1;
        if (currentLv >= 5) return;

        const cost = upData.costs[currentLv];
        if (this.state.money < cost) {
            window.gameUI.showNotification('소지금이 부족합니다!', '#e74c3c');
            return;
        }

        this.state.money -= cost;
        this.state.playerUpgrades[upgradeKey] = currentLv + 1;
        
        // 소지량 업그레이드 즉시 반영
        if (upgradeKey === 'CAPACITY') {
            this.player.userData.maxInventory = upData.levels[currentLv];
        }

        if (window.soundManager) window.soundManager.playCoin();
        window.gameUI.showNotification(`✨ ${upData.name} Lv.${currentLv + 1} 업그레이드 완료!`, '#2ecc71');
        window.gameUI.renderUpgradeModal();
        window.gameUI.updateHUD();
    }

    // 시설 규모 업그레이드
    upgradeWarehouseTier() {
        const nextTier = this.state.warehouseTier + 1;
        if (nextTier > 3) return;

        const tierData = GAME_CONFIG.WAREHOUSE_TIERS[nextTier - 1];
        if (this.state.money < tierData.cost) {
            window.gameUI.showNotification('소지금이 부족합니다!', '#e74c3c');
            return;
        }

        this.state.money -= tierData.cost;
        this.state.warehouseTier = nextTier;

        // 시설별 해금 효과
        if (nextTier === 2) {
            // 카트 3대 해금 & 도크 적재 한도 20 확장
            this.logistics.inboundDockCapacity = 20;
        } else if (nextTier === 3) {
            // 지게차 2대 해금 & 도크 적재 한도 30 확장
            this.logistics.inboundDockCapacity = 30;
        }

        this.logistics.updateFacilityVehicles(nextTier);

        if (window.soundManager) window.soundManager.playJackpot();
        window.gameUI.showNotification(`🎉 시설 확장 완료: [${tierData.name}] 축하합니다!`, '#2ecc71');
        window.gameUI.renderUpgradeModal();
        window.gameUI.updateHUD();
    }

    // 출고 노선 해금
    unlockRegion(regionKey) {
        const regData = GAME_CONFIG.REGIONS[regionKey];
        if (!regData || this.logistics.unlockedRegions.includes(regionKey)) return;

        if (this.state.money < regData.unlockCost) {
            window.gameUI.showNotification('소지금이 부족합니다!', '#e74c3c');
            return;
        }

        this.state.money -= regData.unlockCost;
        this.logistics.unlockRegion(regionKey);
        window.gameUI.updateHUD();
    }

    // 트럭 배차 간격 업그레이드
    upgradeTruckInterval() {
        const cur = this.state.truckIntervalLevel;
        if (cur >= 5) return;
        const cost = GAME_CONFIG.TRUCK_INTERVAL_UPGRADES.costs[cur];

        if (this.state.money < cost) {
            window.gameUI.showNotification('소지금이 부족합니다!', '#e74c3c');
            return;
        }

        this.state.money -= cost;
        this.state.truckIntervalLevel++;
        if (window.soundManager) window.soundManager.playCoin();
        window.gameUI.showNotification(`⏱️ 트럭 배차 간격 Lv.${this.state.truckIntervalLevel} 단축 완료!`, '#2ecc71');
        window.gameUI.renderUpgradeModal();
        window.gameUI.updateHUD();
    }

    // 입고 선반 적재 용량 업그레이드
    upgradeDockCapacity() {
        const curLv = this.state.dockCapacityLevel || 1;
        const levels = GAME_CONFIG.DOCK_CAPACITY_UPGRADES.levels;
        const costs = GAME_CONFIG.DOCK_CAPACITY_UPGRADES.costs;
        if (curLv >= levels.length) return;

        const cost = costs[curLv];
        if (this.state.money < cost) {
            window.gameUI.showNotification('소지금이 부족합니다!', '#e74c3c');
            return;
        }

        this.state.money -= cost;
        this.state.dockCapacityLevel = curLv + 1;
        const newCap = levels[curLv];
        this.logistics.inboundDockCapacity = newCap;

        // [모듈 3] 렉 선반 3D 물리 모델 증축 (Lv.2: 1호기 2단 / Lv.3: 2호기 신설 / Lv.5: 2호기 2단 증축)
        if (this.logistics.inboundDock && this.logistics.inboundDock.updateRackTier) {
            this.logistics.inboundDock.updateRackTier(curLv + 1);
        }
        this.logistics.updateDockVisuals();

        if (window.soundManager) window.soundManager.playCoin();
        window.gameUI.showNotification(`📦 입고 선반 적재 용량 Lv.${curLv + 1} (${newCap}개) 확장 완료!`, '#2ecc71');
        window.gameUI.renderUpgradeModal();
        window.gameUI.updateHUD();
    }

    // 출고 선반 적재 용량 업그레이드 (10, 20, 30, 35, 40)
    upgradeOutboundRackCapacity() {
        const curLv = this.state.outboundCapacityLevel || 2;
        const upgrades = GAME_CONFIG.OUTBOUND_RACK_CAPACITY_UPGRADES;
        if (curLv >= upgrades.levels.length) return;

        const cost = upgrades.costs[curLv];
        if (this.state.money < cost) {
            window.gameUI.showNotification(`소지금이 부족합니다! (필요: ${cost.toLocaleString()}원)`, '#e74c3c');
            return;
        }

        this.state.money -= cost;
        this.state.outboundCapacityLevel = curLv + 1;
        const newCap = upgrades.levels[curLv];
        this.logistics.setOutboundRackCapacity(newCap);

        if (window.soundManager) window.soundManager.playCoin();
        window.gameUI.showNotification(`📦 출고 선반 층 증축 완료! (최대 적재 ${newCap}개로 확장)`, '#2ecc71');
        window.gameUI.renderUpgradeModal();
        window.gameUI.updateHUD();
    }

    // 테스트용 치트 자금 지급 (+1,000원)
    addTestMoney(amount = 1000) {
        this.state.money += amount;
        if (window.soundManager) window.soundManager.playCoin();
        if (window.gameUI) {
            window.gameUI.showNotification(`💰 테스트 지원금 +${amount.toLocaleString()}원이 지급되었습니다!`, '#f1c40f');
            window.gameUI.updateHUD();
            window.gameUI.renderUpgradeModal();
        }
    }

    // 플레이어 머리 위 박스 비주얼 동기화
    updatePlayerStackVisual() {
        const stack = this.player.carryStack;
        while (stack.children.length > 0) {
            stack.remove(stack.children[0]);
        }

        // [파트 C 13번] 플레이어가 카트를 밀고 있을 때는 카트 적재함에 상자 시각화
        if (this.playerCart) {
            this.playerCart.userData.cargoList = this.player.userData.inventory;
            if (this.playerCart.updateVisual) this.playerCart.updateVisual();
            if (window.gameUI) window.gameUI.updateHUD();
            return;
        }

        this.player.userData.inventory.forEach((item, idx) => {
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

        if (window.gameUI) window.gameUI.updateHUD();
    }

    // 메인 루프 시작
    initLoop() {
        let lastTime = performance.now();

        const loop = (time) => {
            requestAnimationFrame(loop);
            const delta = Math.min((time - lastTime) / 1000, 0.1);
            lastTime = time;

            if (!this.state.isPaused) {
                try {
                    this.update(delta);
                } catch (err) {
                    console.error('Simulation update error:', err);
                }
            }

            if (this.controls) this.controls.update();
            this.renderer.render(this.scene, this.camera);
        };

        requestAnimationFrame(loop);
    }

    // 메인 시뮬레이션 업데이트
    update(delta) {
        // 1. 시간 및 주야간 사이클
        this.updateDayNightCycle(delta);

        // 2. 피버타임 카운트다운
        this.updateFeverTime(delta);

        // 3. 기상 시스템 업데이트
        this.weatherManager.update(delta);

        // 4. 물류 파이프라인 업데이트
        this.logistics.update(delta, this.state, this.weatherManager);

        // 5. 알바생 AI 업데이트
        this.workerManager.update(delta, this.state, this.weatherManager);

        // 6. 플레이어 컨트롤 및 애니메이션
        this.updatePlayerMovement(delta);

        // 7. 플레이어 발판 상호작용
        this.updatePlayerPadInteraction(delta);

        // 8. 경제 분당 매출 롤링 윈도우 계산
        this.updateEconomyMetrics(delta);

        // 8-1. [파트 B 8번] 시설 운영 기본 유지비 실시간 차감 (안전장치: 0원 밑으로 떨어지지 않음)
        const tierIdx = (this.state.warehouseTier || 1) - 1;
        const tierCfg = GAME_CONFIG.WAREHOUSE_TIERS[tierIdx];
        const maintenanceSec = tierCfg ? (tierCfg.maintenanceCostSec || 0.5) : 0.5;
        if (maintenanceSec > 0 && this.state.money > 0) {
            this.state.money = Math.max(0, this.state.money - maintenanceSec * delta);
        }

        // 9. 상단 HUD 갱신
        if (window.gameUI) {
            window.gameUI.updateHUD();
            window.gameUI.updateOutboundTruckButton();
        }
    }

    // 주야간 사이클 & 조명 제어
    updateDayNightCycle(delta) {
        this.state.dayTimer += delta;
        if (this.state.dayTimer >= GAME_CONFIG.TIME.DAY_DURATION) {
            this.state.dayTimer = 0;
            this.state.currentDay++;
            this.weatherManager.onNewDay();
            if (window.gameUI) {
                window.gameUI.showNotification(`☀️ 새로운 하루가 밝았습니다! (DAY ${this.state.currentDay})`, '#f1c40f');
            }
        }

        // 실외 Directional Light 주야간 조도 변화
        // 낮 90초: 밝음 / 밤 30초: 어두운 푸른빛 (야간 수당 & 야간 할증 발동)
        const isDay = this.state.dayTimer < GAME_CONFIG.TIME.DAY_TIME;
        this.state.isNight = !isDay;
        if (isDay) {
            const dayProgress = this.state.dayTimer / GAME_CONFIG.TIME.DAY_TIME;
            this.sunLight.intensity = 1.25;
            this.sunLight.color.setHex(0xfff5e6);
            this.scene.background.setHex(0xdce7f0);
            this.scene.fog.color.setHex(0xdce7f0);
        } else {
            // 밤 시간대
            this.sunLight.intensity = 0.22;
            this.sunLight.color.setHex(0x3a506b);
            this.scene.background.setHex(0x0b132b);
            this.scene.fog.color.setHex(0x0b132b);
        }

        // 뇌우 정전 상태일 때 실내 조명 암전 및 붉은 비상등(Dark Red Emergency Light) 점등
        // 오직 긴급 정전 작업(비상 발전기 필요)이 실제로 발령(isEmergencyActive)되었을 때만 점등
        const isThunderBlackout = (this.weatherManager.currentWeather === 'thunder' && this.weatherManager.isEmergencyActive && !this.weatherManager.isEmergencyResolved);
        if (isThunderBlackout) {
            // 정전 발생: 실내 일반 조명은 거의 암전 수준으로 낮춤
            this.indoorLights.forEach(light => {
                light.intensity = Math.random() < 0.1 ? 0.1 : 0.02; // 희미한 깜빡임
            });
            this.ambientLight.intensity = 0.12;
            if (this.emergencyLight) {
                this.emergencyLight.intensity = 1.35; // 붉은 비상등 강력 점등
            }
        } else {
            // 정상 상태: 24시간 언제나 실내는 대낮처럼 환한 조도 유지
            this.indoorLights.forEach(light => {
                light.intensity = 1.1;
            });
            this.ambientLight.intensity = 0.55;
            if (this.emergencyLight) {
                this.emergencyLight.intensity = 0; // 비상등 소등
            }
        }
    }

    // 피버타임 관리
    updateFeverTime(delta) {
        if (this.state.isFeverTime) {
            this.state.feverTimeRemaining -= delta;
            if (this.state.feverTimeRemaining <= 0) {
                this.state.isFeverTime = false;
                this.state.feverCooldownRemaining = GAME_CONFIG.FEVER_TIME.COOLDOWN;
                if (window.gameUI) {
                    window.gameUI.showNotification('앙팡데이 피버타임이 종료되었습니다.', '#95a5a6');
                    window.gameUI.showFeverBanner(false);
                }
            }
        } else if (this.state.feverCooldownRemaining > 0) {
            this.state.feverCooldownRemaining -= delta;
        }
    }

    // [모듈 5 & 13] 지게차 / 카트 탑승 및 하차 토글
    toggleVehicleRide() {
        // 1. 이미 지게차에 탑승 중인 경우 하차
        if (this.ridingVehicle) {
            const fork = this.ridingVehicle;
            this.ridingVehicle = null;
            fork.userData.driver = null;
            this.player.visible = true;
            this.player.position.set(fork.position.x + 1.8, 0, fork.position.z);
            if (fork.updateStatusLabel) {
                fork.updateStatusLabel(fork.userData.cargoList.length, 8, fork.userData.targetRegion, false);
            }
            if (window.soundManager) window.soundManager.playClick();
            if (window.gameUI) {
                window.gameUI.showNotification('🚜 지게차에서 내렸습니다. (현재 위치 정차 보존)', '#94a3b8');
            }
            return;
        }

        // 2. 이미 카트를 밀고 있는 경우 하차
        if (this.playerCart) {
            const cart = this.playerCart;
            this.playerCart = null;
            cart.userData.carrier = null;
            // 플레이어 소지량 원래대로 복원
            const baseCap = GAME_CONFIG.PLAYER_UPGRADES.CAPACITY.levels[this.state.playerUpgrades.CAPACITY - 1];
            this.player.userData.maxInventory = baseCap;
            this.updatePlayerStackVisual();
            if (window.soundManager) window.soundManager.playClick();
            if (window.gameUI) {
                window.gameUI.showNotification('🛒 카트 손잡이를 놓았습니다.', '#94a3b8');
                window.gameUI.updateHUD();
            }
            return;
        }

        // 3. 근처 지게차 탐색 (반경 3.2m 이내)
        const forklifts = this.logistics.forklifts || [];
        let nearestFork = null;
        let minForkDist = 3.2;

        for (const fork of forklifts) {
            if (!fork.visible || fork.userData.driver) continue;
            const dist = this.player.position.distanceTo(fork.position);
            if (dist < minForkDist) {
                minForkDist = dist;
                nearestFork = fork;
            }
        }

        if (nearestFork) {
            this.ridingVehicle = nearestFork;
            nearestFork.userData.driver = this.player;
            this.player.visible = false; // 운전석 탑승 효과
            if (nearestFork.updateStatusLabel) {
                nearestFork.updateStatusLabel(nearestFork.userData.cargoList.length, 8, nearestFork.userData.targetRegion, true);
            }
            if (window.soundManager) window.soundManager.playHorn();
            if (window.gameUI) {
                const regName = nearestFork.userData.targetRegion && GAME_CONFIG.REGIONS[nearestFork.userData.targetRegion]
                    ? GAME_CONFIG.REGIONS[nearestFork.userData.targetRegion].name
                    : '미지정';
                window.gameUI.showNotification(`🚜 지게차 탑승 완료! (조이스틱/WASD: 운전 / E: 하차 / 적재지역: ${regName})`, '#f39c12');
            }
            return;
        }

        // 4. 근처 운반 카트 탐색 (반경 2.5m 이내)
        const carts = this.logistics.carts || [];
        let nearestCart = null;
        let minCartDist = 2.5;

        for (const cart of carts) {
            if (!cart.visible || cart.userData.carrier) continue;
            const dist = this.player.position.distanceTo(cart.position);
            if (dist < minCartDist) {
                minCartDist = dist;
                nearestCart = cart;
            }
        }

        if (nearestCart) {
            this.playerCart = nearestCart;
            nearestCart.userData.carrier = this.player;
            this.player.userData.maxInventory = 8; // 카트 장착 시 소지량 8개로 확장
            this.updatePlayerStackVisual();
            if (window.soundManager) window.soundManager.playClick();
            if (window.gameUI) {
                window.gameUI.showNotification('🛒 운반 카트 장착 완료! (이동속도 +30%, 소지량 8개 확장 / E: 놓기)', '#38bdf8');
                window.gameUI.updateHUD();
            }
        }
    }

    toggleForkliftRide() {
        this.toggleVehicleRide();
    }

    // 지게차 운전 조작 및 이동 (WASD + 조이스틱)
    updateForkliftMovement(delta) {
        const fork = this.ridingVehicle;
        if (!fork) return;

        const speed = fork.userData.speed || 4.8; // 묵직하고 안정적인 중장비 주행감
        let moveX = 0;
        let moveZ = 0;

        if (this.keys['w'] || this.keys['arrowup']) moveZ -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) moveZ += 1;
        if (this.keys['a'] || this.keys['arrowleft']) moveX -= 1;
        if (this.keys['d'] || this.keys['arrowright']) moveX += 1;

        if (moveX !== 0 || moveZ !== 0) {
            const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
            const stepX = (moveX / len) * speed * delta;
            const stepZ = (moveZ / len) * speed * delta;

            fork.position.x += stepX;
            fork.position.z += stepZ;
            fork.rotation.y = Math.atan2(moveX, moveZ);
        } else if (this.isJoystickActive && (this.joystickVector.x !== 0 || this.joystickVector.z !== 0)) {
            // 조이스틱 벡터 기반 지게차 주행
            fork.position.x += this.joystickVector.x * speed * delta;
            fork.position.z += this.joystickVector.z * speed * delta;
            fork.rotation.y = Math.atan2(this.joystickVector.x, this.joystickVector.z);
        }

        // 창고 및 확장 하역장 이동 경계 (3단계 시 X=31.5까지 확장)
        const maxForkX = (this.state.warehouseTier >= 3) ? 31.5 : 20.0;
        fork.position.x = Math.max(-20, Math.min(maxForkX, fork.position.x));
        fork.position.z = Math.max(-12, Math.min(12, fork.position.z));

        // 플레이어 위치 동기화
        this.player.position.copy(fork.position);

        // 지게차 8개 파렛트 적재 및 트럭 상차 인터랙션 검사
        this.updateForkliftInteractions(delta);
    }

    // [미니 작업] 지게차 8개 이상 축적 시 우선 파렛트 적재 & 트럭 직행 상차 인터랙션
    updateForkliftInteractions(delta) {
        const fork = this.ridingVehicle;
        if (!fork) return;

        this.forkliftInteractTimer = (this.forkliftInteractTimer || 0) + delta;
        if (this.forkliftInteractTimer < 0.25) return;

        const fPos = fork.position;
        const cargo = fork.userData.cargoList;
        const unlocked = this.logistics.getUnlockedRegions();

        // 1. [지게발 비어있을 때]: 출고 렉 선반(outbound_dock_take)에서 8개 파렛트 한 번에 적재
        if (cargo.length === 0) {
            for (const r of unlocked) {
                const takePad = this.logistics.pads[`outbound_dock_take_${r}`];
                if (!takePad) continue;

                const dist = fPos.distanceTo(takePad.position);
                if (dist <= 3.2) {
                    const dockPkgs = this.logistics.outboundPackages[r] || [];
                    const normalPkgs = dockPkgs.filter(p => !p.isMissorted);

                    // 8개 미만 대기 룰 (자투리 상차 방지)
                    if (normalPkgs.length < 8) {
                        if (Math.random() < 0.08 && window.gameUI) {
                            const regName = GAME_CONFIG.REGIONS[r].name;
                            window.gameUI.showNotification(`💡 [${regName}] 지게차는 택배가 8개 이상 모여야 파렛트를 뜰 수 있습니다! (${normalPkgs.length}/8개)`, '#38bdf8');
                        }
                    } else {
                        // 8개 도달 시 즉시 파렛트로 한 번에 적재!
                        const extracted = [];
                        for (let i = dockPkgs.length - 1; i >= 0 && extracted.length < 8; i--) {
                            if (!dockPkgs[i].isMissorted) {
                                extracted.push(dockPkgs.splice(i, 1)[0]);
                            }
                        }

                        if (extracted.length === 8) {
                            const pallet = {
                                id: 'pallet_' + Date.now(),
                                isPallet: true,
                                packageCount: 8,
                                region: r,
                                isInspected: true,
                            };
                            cargo.push(pallet);
                            fork.userData.targetRegion = r;
                            fork.updateVisual();
                            this.logistics.updateOutboundVisuals(r);
                            this.forkliftInteractTimer = 0;
                            if (window.soundManager) window.soundManager.playJackpot();
                            if (window.gameUI) {
                                const regName = GAME_CONFIG.REGIONS[r].name;
                                window.gameUI.showNotification(`⭐ [${regName}] 지게차 8개 파렛트 적재 완료! 출고 트럭으로 운반하세요!`, '#f1c40f');
                            }
                            return;
                        }
                    }
                }
            }
        }

        // 2. [지게발에 파렛트가 실려있을 때]: 해당 지역 출고 트럭 상차 발판(outbound_truck_load)으로 직행 상차
        if (cargo.length > 0 && fork.userData.targetRegion) {
            const r = fork.userData.targetRegion;
            const loadPad = this.logistics.pads[`outbound_truck_load_${r}`];
            const truck = this.logistics.outboundTrucks[r];

            if (loadPad && fPos.distanceTo(loadPad.position) <= 3.4) {
                if (truck && truck.userData.state === 'docked' && truck.userData.cargoList.length < truck.userData.capacity) {
                    while (cargo.length > 0) {
                        const p = cargo.pop();
                        truck.userData.cargoList.push(p);
                    }
                    fork.userData.targetRegion = null;
                    fork.updateVisual();
                    this.logistics.updateOutboundTruckCargoVisual(r);
                    this.forkliftInteractTimer = 0;
                    if (window.soundManager) window.soundManager.playDrop();
                    if (window.gameUI) {
                        const regName = GAME_CONFIG.REGIONS[r].name;
                        window.gameUI.showNotification(`🚚 [${regName}] 지게차 파렛트(택배 8개 분량) 트럭 직행 상차 완료!`, '#2ecc71');
                        window.gameUI.updateOutboundTruckButton(truck);
                        window.gameUI.updateHUD();
                    }
                }
            }
        }
    }

    // 플레이어 이동 로직 (WASD + 클릭 이동)
    updatePlayerMovement(delta) {
        // [모듈 5] 지게차 탑승 상태 시 지게차 운전 로직으로 전환
        if (this.ridingVehicle) {
            this.updateForkliftMovement(delta);
            return;
        }

        const speedLv = this.state.playerUpgrades.SPEED;
        const baseSpeed = GAME_CONFIG.PLAYER_UPGRADES.SPEED.levels[speedLv - 1];
        const weatherMult = this.weatherManager.getSpeedMultiplier();
        // [파트 C 13번] 카트 장착 시 이동속도 +30% 버프
        const cartSpeedMult = this.playerCart ? 1.3 : 1.0;
        const currentSpeed = baseSpeed * weatherMult * cartSpeedMult;

        let moveX = 0;
        let moveZ = 0;

        if (this.keys['w'] || this.keys['arrowup']) moveZ -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) moveZ += 1;
        if (this.keys['a'] || this.keys['arrowleft']) moveX -= 1;
        if (this.keys['d'] || this.keys['arrowright']) moveX += 1;

        const isKeyboardMoving = (moveX !== 0 || moveZ !== 0);

        if (isKeyboardMoving) {
            this.mouseTarget = null;
            const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
            const stepX = (moveX / len) * currentSpeed * delta;
            const stepZ = (moveZ / len) * currentSpeed * delta;

            this.player.position.x += stepX;
            this.player.position.z += stepZ;
            this.player.rotation.y = Math.atan2(moveX, moveZ);
            this.animatePlayerWalking(delta, true);
        } else if (this.isJoystickActive && (this.joystickVector.x !== 0 || this.joystickVector.z !== 0)) {
            // [파트 B 7번] 클릭 위치 기반 가상 조이스틱 실시간 이동
            const stepX = this.joystickVector.x * currentSpeed * delta;
            const stepZ = this.joystickVector.z * currentSpeed * delta;

            this.player.position.x += stepX;
            this.player.position.z += stepZ;
            this.player.rotation.y = Math.atan2(this.joystickVector.x, this.joystickVector.z);
            this.animatePlayerWalking(delta, true);
        } else if (this.mouseTarget) {
            // 마우스 목표 위치로 이동 (레거시 클릭 지점 도달)
            const diffX = this.mouseTarget.x - this.player.position.x;
            const diffZ = this.mouseTarget.z - this.player.position.z;
            const dist = Math.sqrt(diffX * diffX + diffZ * diffZ);

            if (dist > 0.3) {
                const step = Math.min(dist, currentSpeed * delta);
                this.player.position.x += (diffX / dist) * step;
                this.player.position.z += (diffZ / dist) * step;
                this.player.rotation.y = Math.atan2(diffX, diffZ);
                this.animatePlayerWalking(delta, true);
            } else {
                this.mouseTarget = null;
                this.animatePlayerWalking(delta, false);
            }
        } else {
            this.animatePlayerWalking(delta, false);
        }

        // [파트 C 13번] 카트를 밀고 있는 경우 카트 위치/회전/화물 시각화 동기화
        if (this.playerCart) {
            const forward = new THREE.Vector3(0, 0, 1.4).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.player.rotation.y);
            this.playerCart.position.copy(this.player.position).add(forward);
            this.playerCart.rotation.y = this.player.rotation.y;
            this.playerCart.userData.cargoList = this.player.userData.inventory;
            if (this.playerCart.updateVisual) this.playerCart.updateVisual();
        }

        // 창고 및 실외 외곽 경계 제한 (실외 하차 트럭 X=-32부터 메가허브 출고 트럭 X=31.5까지 이동 허용)
        const maxPlayerX = (this.state.warehouseTier >= 3) ? 31.5 : 24.0;
        this.player.position.x = Math.max(-32, Math.min(maxPlayerX, this.player.position.x));
        this.player.position.z = Math.max(-13, Math.min(13, this.player.position.z));
    }

    animatePlayerWalking(delta, isWalking) {
        if (isWalking) {
            this.playerWalkCycle = (this.playerWalkCycle || 0) + delta * 12;
            const swing = Math.sin(this.playerWalkCycle) * 0.4;
            if (this.player.leftLeg) this.player.leftLeg.rotation.x = swing;
            if (this.player.rightLeg) this.player.rightLeg.rotation.x = -swing;
        } else {
            if (this.player.leftLeg) this.player.leftLeg.rotation.x = 0;
            if (this.player.rightLeg) this.player.rightLeg.rotation.x = 0;
        }
    }

    // 플레이어 발판 상호작용 검사 (기획서의 모든 발판 규칙)
    updatePlayerPadInteraction(delta) {
        // [모듈 5] 지게차 탑승 중일 때는 도보 발판 상호작용 건너뜀
        if (this.ridingVehicle) return;

        const pPos = this.player.position;
        const pads = this.logistics.pads;
        const workLv = this.state.playerUpgrades.WORK_SPEED;
        const workSpeedMult = GAME_CONFIG.PLAYER_UPGRADES.WORK_SPEED.levels[workLv - 1] * this.weatherManager.getWorkSpeedMultiplier();

        let activePadKey = null;

        // 발판과의 거리 체크
        for (const [key, pad] of Object.entries(pads)) {
            if (!pad.visible) continue;
            const dist = pPos.distanceTo(pad.position);
            if (dist <= pad.radius) {
                activePadKey = key;
                break;
            }
        }

        // 발판이 바뀌었으면 이전 발판 게이지 초기화
        if (this.currentActivePad && this.currentActivePad !== activePadKey) {
            if (pads[this.currentActivePad]) pads[this.currentActivePad].setProgress(0);
            this.padTimer = 0;
        }
        this.currentActivePad = activePadKey;

        if (!activePadKey) return;

        const pad = pads[activePadKey];
        const inv = this.player.userData.inventory;
        const maxInv = this.player.userData.maxInventory;

        // ==========================================
        // 1. 하차 트럭 발판 (truck_unload)
        // 기획: 트럭 앞 원형 발판에 서면 트럭 적재함(10개)에서 택배 수거
        // 도크 적재 한도 도달 시 트럭에서 더 이상 하차할 수 없음
        // ==========================================
        if (activePadKey === 'truck_unload') {
            const truck = this.logistics.inboundTruck;
            const dockCount = this.logistics.dockPackages.length;
            const dockCap = this.logistics.inboundDockCapacity;

            if (dockCount >= dockCap) {
                pad.setProgress(0);
                if (Math.random() < 0.05 && window.gameUI) {
                    window.gameUI.showNotification(`⚠️ 입고 선반이 가득 차 더 이상 하차할 수 없습니다! (${dockCount}/${dockCap})`, '#e74c3c');
                }
                return;
            }

            const interactInterval = 0.18 / workSpeedMult;
            if (truck.userData.state === 'docked' && truck.userData.cargoList.length > 0 && inv.length < maxInv) {
                this.padTimer += delta;
                if (this.padTimer >= interactInterval) {
                    this.padTimer = 0;
                    const pkg = truck.userData.cargoList.pop();
                    inv.push(pkg);
                    this.updatePlayerStackVisual();
                    this.logistics.updateInboundTruckCargoVisual();
                    if (window.soundManager) window.soundManager.playPickup();
                }
            } else {
                this.padTimer = 0;
            }
        }

        // ==========================================
        // 2. 통합 입고 선반 왼쪽 발판 (dock_put): 트럭에서 가져온 택배 올리기
        // 도크 적재 한도 도달 시 더 이상 둘 수 없음
        // ==========================================
        else if (activePadKey === 'dock_put') {
            const dock = this.logistics.dockPackages;
            const dockCap = this.logistics.inboundDockCapacity;
            const interactInterval = 0.18 / workSpeedMult;

            if (inv.length > 0 && dock.length < dockCap) {
                this.padTimer += delta;
                if (this.padTimer >= interactInterval) {
                    this.padTimer = 0;
                    const pkg = inv.pop();
                    dock.push(pkg);
                    this.updatePlayerStackVisual();
                    this.logistics.updateDockVisuals();
                    if (window.soundManager) window.soundManager.playDrop();
                }
            } else if (dock.length >= dockCap && inv.length > 0) {
                if (Math.random() < 0.05 && window.gameUI) {
                    window.gameUI.showNotification(`입고 선반 적재 한도 초과 (${dockCap}개)`, '#e74c3c');
                }
                this.padTimer = 0;
            } else {
                this.padTimer = 0;
            }
        }

        // ==========================================
        // 3. 통합 입고 선반 위쪽 발판 (scan_action): 
        // - 선반 위 미스캔 택배 일괄 송장 스캔
        // - [모듈 7] 플레이어가 손에 오분류(검정) 택배를 들고 있을 때: 3초 스캔 후 원래 목적지 색상으로 정상 복구!
        // ==========================================
        else if (activePadKey === 'scan_action') {
            const hasUnscanned = this.logistics.dockPackages.some(p => !p.region);
            const hasMissortedInHand = inv.some(p => p.isMissorted);

            if (hasUnscanned || hasMissortedInHand) {
                this.padTimer += delta * workSpeedMult;
                const progress = Math.min(1.0, this.padTimer / GAME_CONFIG.PAD.ACTION_DURATION);
                pad.setProgress(progress);

                if (this.padTimer >= GAME_CONFIG.PAD.ACTION_DURATION) {
                    // [단계 1] 손에 든 오분류 상자 복구
                    if (hasMissortedInHand) {
                        let recoveredCount = 0;
                        inv.forEach(p => {
                            if (p.isMissorted) {
                                p.isMissorted = false;
                                p.isInspected = false;
                                p.missortTruckPassCount = 0;
                                p.wasMissortedRecovery = true; // 올바른 분류대 투입 시 보너스 마킹
                                recoveredCount++;
                            }
                        });
                        this.updatePlayerStackVisual();
                        if (window.soundManager) window.soundManager.playScan();
                        if (window.gameUI) {
                            window.gameUI.showNotification(`✨ 오분류 택배 ${recoveredCount}건 재스캔 완료! 원래 지역 색상으로 복구되었습니다. 올바른 분류대로 가져가세요!`, '#38bdf8');
                        }
                    }

                    // [단계 2] 선반 위 미스캔 택배 스캔
                    if (hasUnscanned) {
                        this.logistics.processScanTableAction();
                    }

                    this.padTimer = 0;
                    pad.setProgress(0);
                }
            } else {
                pad.setProgress(0);
                this.padTimer = 0;
            }
        }

        // ==========================================
        // 4. 통합 입고 선반 오른쪽 발판 (dock_take): 스캔 완료된 택배 꺼내어 분류대로 이동
        // ==========================================
        else if (activePadKey === 'dock_take') {
            const dock = this.logistics.dockPackages;
            const scannedIdx = dock.findIndex(p => p.region && !p.isInspected);
            const interactInterval = 0.18 / workSpeedMult;

            if (scannedIdx !== -1 && inv.length < maxInv) {
                this.padTimer += delta;
                if (this.padTimer >= interactInterval) {
                    this.padTimer = 0;
                    const pkg = dock.splice(scannedIdx, 1)[0];
                    inv.push(pkg);
                    this.updatePlayerStackVisual();
                    this.logistics.updateDockVisuals();
                    if (window.soundManager) window.soundManager.playPickup();
                }
            } else if (dock.length > 0 && inv.length < maxInv && !dock.some(p => p.region)) {
                this.padTimer = 0;
                if (Math.random() < 0.05 && window.gameUI) {
                    window.gameUI.showNotification('💡 선반 위쪽 발판에서 먼저 [송장 스캔]을 진행하세요!', '#38bdf8');
                }
            } else {
                this.padTimer = 0;
            }
        }

        // ==========================================
        // 7. 분류대 3종 왼쪽 발판 (sort_put_[region]): 스캔 완료 택배 내려놓기
        // [파트 A 4번] 플레이어는 해당 분류대의 지역과 일치하는 택배만 내려놓도록 엄격 제한 (오분류 원천 방지)
        // ==========================================
        else if (activePadKey.startsWith('sort_put_')) {
            const region = activePadKey.replace('sort_put_', '');
            const tbl = this.logistics.sortingTables[region];
            const interactInterval = 0.18 / workSpeedMult;

            if (inv.length > 0 && tbl) {
                const matchIdx = inv.findIndex(p => p.region === region && !p.isInspected);

                if (matchIdx !== -1) {
                    this.padTimer += delta;
                    if (this.padTimer >= interactInterval) {
                        this.padTimer = 0;
                        const pkg = inv.splice(matchIdx, 1)[0];
                        tbl.uninspected.push(pkg);
                        this.updatePlayerStackVisual();
                        this.logistics.updateSortingVisuals(region);
                        if (window.soundManager) window.soundManager.playDrop();

                        // [모듈 7] 오분류 수습 완료 보너스 지급 (평판 +5)
                        if (pkg.wasMissortedRecovery) {
                            pkg.wasMissortedRecovery = false;
                            this.state.reputation += 5;
                            if (window.gameUI) {
                                window.gameUI.showNotification('🌟 오분류 택배 정상 수습 완료! (기업 평판 +5 획득)', '#2ecc71');
                                window.gameUI.updateHUD();
                            }
                        }
                    }
                } else {
                    this.padTimer = 0;
                    const hasUnscanned = inv.some(p => !p.region);
                    if (hasUnscanned) {
                        if (Math.random() < 0.05 && window.gameUI) {
                            window.gameUI.showNotification('⚠️ 아직 송장 스캔이 되지 않은 택배입니다! 입고 선반 위쪽 발판에서 먼저 스캔하세요.', '#f39c12');
                        }
                    } else {
                        if (Math.random() < 0.05 && window.gameUI) {
                            const targetName = GAME_CONFIG.REGIONS[region].name;
                            const targetColor = region === 'daegu' ? '초록' : (region === 'busan' ? '파랑' : '빨강');
                            window.gameUI.showNotification(`⚠️ [${targetName} (${targetColor})] 전용 분류대입니다. 일치하는 택배만 투입할 수 있습니다.`, '#e74c3c');
                        }
                    }
                }
            } else {
                this.padTimer = 0;
            }
        }

        // ==========================================
        // 8. 분류대 3종 우측 발판 (sort_inspect_[region]): 3초 머무르면 검수 100% 완료
        // ==========================================
        else if (activePadKey.startsWith('sort_inspect_')) {
            const region = activePadKey.replace('sort_inspect_', '');
            const tbl = this.logistics.sortingTables[region];

            if (tbl && tbl.uninspected.length > 0) {
                this.padTimer += delta * workSpeedMult;
                const progress = Math.min(1.0, this.padTimer / GAME_CONFIG.PAD.ACTION_DURATION);
                pad.setProgress(progress);

                if (this.padTimer >= GAME_CONFIG.PAD.ACTION_DURATION) {
                    this.logistics.processSortingInspect(region);
                    this.padTimer = 0;
                    pad.setProgress(0);
                }
            } else {
                pad.setProgress(0);
                this.padTimer = 0;
            }
        }

        // ==========================================
        // 9. 분류대 3종 아래쪽 발판 (sort_take_[region]): 검수 완료된 택배 들기
        // ==========================================
        else if (activePadKey.startsWith('sort_take_')) {
            const region = activePadKey.replace('sort_take_', '');
            const tbl = this.logistics.sortingTables[region];
            const interactInterval = 0.18 / workSpeedMult;

            if (tbl && tbl.inspected.length > 0 && inv.length < maxInv) {
                this.padTimer += delta;
                if (this.padTimer >= interactInterval) {
                    this.padTimer = 0;
                    const pkg = tbl.inspected.pop();
                    inv.push(pkg);
                    this.updatePlayerStackVisual();
                    this.logistics.updateSortingVisuals(region);
                    if (window.soundManager) window.soundManager.playPickup();
                }
            } else {
                this.padTimer = 0;
            }
        }

        // ==========================================
        // 10-A. [모듈 3] 출고 도크 좌측 발판 (outbound_dock_put_[region]): 선반에 내려놓기(보관) 전용
        // - 플레이어가 택배를 들고 서 있으면 선반에 내려놓기만 수행 (들었다 놨다 버그 완전 제거)
        // ==========================================
        else if (activePadKey.startsWith('outbound_dock_put')) {
            const region = activePadKey.replace('outbound_dock_put_', '');
            const dockPkgs = this.logistics.outboundPackages[region] || this.logistics.outboundPackages.daegu;
            const maxCap = this.logistics.outboundRackCapacity || 20;
            const interactInterval = 0.18 / workSpeedMult;

            // 해당 지역과 일치하는 검수 완료 택배 또는 오분류 택배 우선 내려놓기
            const pkgIdx = inv.findIndex(p => p.isInspected && !p.isPallet && (p.region === region || p.isMissorted));
            const anyInspectedIdx = pkgIdx !== -1 ? pkgIdx : inv.findIndex(p => p.isInspected && !p.isPallet);

            if (anyInspectedIdx !== -1) {
                if (dockPkgs.length >= maxCap) {
                    if (Math.random() < 0.05 && window.gameUI) {
                        window.gameUI.showNotification(`⚠️ 출고 선반이 가득 찼습니다! (최대 ${maxCap}개) 업그레이드로 층을 늘리세요!`, '#e74c3c');
                    }
                    this.padTimer = 0;
                    return;
                }
                this.padTimer += delta;
                if (this.padTimer >= interactInterval) {
                    this.padTimer = 0;
                    const pkg = inv.splice(anyInspectedIdx, 1)[0];
                    dockPkgs.push(pkg);
                    this.updatePlayerStackVisual();
                    this.logistics.updateOutboundVisuals(region);
                    if (window.soundManager) window.soundManager.playDrop();
                }
            } else {
                this.padTimer = 0;
            }
        }

        // ==========================================
        // 10-B. [모듈 3] 출고 도크 우측 발판 (outbound_dock_take_[region]): 선반에서 꺼내기 전용
        // ⭐ 스마트 오분류 우선 픽업 및 상호 혼입 방지:
        // 손에 오분류 택배를 들고 있으면 도크의 정상 택배 픽업 차단, 손에 정상 택배를 들고 있으면 오분류 픽업 차단
        // ==========================================
        else if (activePadKey.startsWith('outbound_dock_take')) {
            const region = activePadKey.replace('outbound_dock_take_', '');
            const dockPkgs = this.logistics.outboundPackages[region] || this.logistics.outboundPackages.daegu;
            const interactInterval = 0.18 / workSpeedMult;

            if (dockPkgs.length > 0 && inv.length < maxInv) {
                this.padTimer += delta;
                if (this.padTimer >= interactInterval) {
                    this.padTimer = 0;

                    const hasMissortedInHand = inv.some(p => p.isMissorted);
                    const hasNormalInHand = inv.some(p => !p.isMissorted);

                    let pickedPkg = null;

                    if (hasMissortedInHand) {
                        // 손에 오분류 택배가 있는 경우: 도크의 오분류 택배만 추가 수거 (정상 택배 혼입 원천 차단)
                        const missortIdx = dockPkgs.findIndex(p => p.isMissorted);
                        if (missortIdx !== -1) {
                            pickedPkg = dockPkgs.splice(missortIdx, 1)[0];
                        } else {
                            // 도크에 오분류 택배가 더 이상 없으면 정상 택배는 집지 않음
                            return;
                        }
                    } else if (hasNormalInHand) {
                        // 손에 정상 택배가 있는 경우: 도크의 정상 택배만 수거 (오분류 택배 혼입 차단)
                        const normalIdx = dockPkgs.findIndex(p => !p.isMissorted);
                        if (normalIdx !== -1) {
                            pickedPkg = dockPkgs.splice(normalIdx, 1)[0];
                        } else {
                            // 도크에 정상 택배가 없으면 오분류 택배는 집지 않음
                            return;
                        }
                    } else {
                        // 손이 비어있는 경우: 1순위 오분류 택배 우선 탐색, 없으면 2순위 정상 택배 꺼내기
                        const missortIdx = dockPkgs.findIndex(p => p.isMissorted);
                        if (missortIdx !== -1) {
                            pickedPkg = dockPkgs.splice(missortIdx, 1)[0];
                            if (window.gameUI) {
                                window.gameUI.showNotification('⚠️ 오분류 택배를 수거했습니다! 스캔대에서 원래 색상으로 재스캔하세요.', '#f59e0b');
                            }
                        } else {
                            pickedPkg = dockPkgs.pop();
                        }
                    }

                    if (pickedPkg) {
                        inv.push(pickedPkg);
                        this.updatePlayerStackVisual();
                        this.logistics.updateOutboundVisuals(region);
                        if (window.soundManager) window.soundManager.playPickup();
                    }
                }
            } else {
                this.padTimer = 0;
            }
        }

        // ==========================================
        // 11. 출고 트럭 상차 발판 (outbound_truck_load_[region]): 트럭 적재함 직행 상차 (도크 경유 불필요)
        // 대구 상자는 대구 트럭에만, 부산 상자는 부산 트럭에만! (오배송 및 오분류 차단)
        // ==========================================
        else if (activePadKey.startsWith('outbound_truck_load')) {
            const region = activePadKey.startsWith('outbound_truck_load_')
                ? activePadKey.replace('outbound_truck_load_', '')
                : 'daegu';
            const truck = this.logistics.outboundTrucks[region] || this.logistics.outboundTrucks.daegu;
            const interactInterval = 0.18 / workSpeedMult;

            if (truck && truck.userData.state === 'docked' && truck.userData.cargoList.length < truck.userData.capacity) {
                // 1순위: 손에 든 해당 지역 전용 파렛트 상차
                const palletIdx = inv.findIndex(p => p.isPallet && p.region === region);
                // 2순위: 손에 든 해당 지역 전용 정상 검수 완료 일반 택배 상차 (오분류 제외!)
                const inspectedIdx = inv.findIndex(p => p.isInspected && !p.isPallet && !p.isMissorted && p.region === region);

                if (palletIdx !== -1) {
                    this.padTimer += delta;
                    if (this.padTimer >= interactInterval) {
                        this.padTimer = 0;
                        const pallet = inv.splice(palletIdx, 1)[0];
                        truck.userData.cargoList.push(pallet);
                        this.updatePlayerStackVisual();
                        this.logistics.updateOutboundTruckCargoVisual(region);
                        if (window.soundManager) window.soundManager.playDrop();
                        if (window.gameUI) {
                            window.gameUI.updateOutboundTruckButton(truck);
                            window.gameUI.updateHUD();
                        }
                    }
                } else if (inspectedIdx !== -1) {
                    this.padTimer += delta;
                    if (this.padTimer >= interactInterval) {
                        this.padTimer = 0;
                        const pkg = inv.splice(inspectedIdx, 1)[0];
                        truck.userData.cargoList.push(pkg);
                        this.updatePlayerStackVisual();
                        this.logistics.updateOutboundTruckCargoVisual(region);
                        if (window.soundManager) window.soundManager.playDrop();
                        if (window.gameUI) {
                            window.gameUI.updateOutboundTruckButton(truck);
                            window.gameUI.updateHUD();
                        }
                    }
                } else {
                    const targetName = GAME_CONFIG.REGIONS[region] ? GAME_CONFIG.REGIONS[region].name : region;
                    const hasOtherRegion = inv.some(p => p.isInspected && p.region !== region);
                    const hasMissortedOnly = inv.some(p => p.isMissorted);

                    if (hasOtherRegion && Math.random() < 0.05 && window.gameUI) {
                        window.gameUI.showNotification(`⚠️ [${targetName} 전용 트럭]입니다! 타 지역 택배는 실을 수 없습니다.`, '#e74c3c');
                    } else if (hasMissortedOnly && Math.random() < 0.05 && window.gameUI) {
                        window.gameUI.showNotification('⚠️ 오분류된 택배는 트럭에 상차할 수 없습니다! 출고 완충 도크에 보관하세요.', '#e74c3c');
                    }
                    this.padTimer = 0;
                }
            } else {
                this.padTimer = 0;
            }
        }


        // ==========================================
        // 11. 긴급 미션 발판 3종 (제설, 차수판, 발전기 3초 상호작용)
        // ==========================================
        else if (activePadKey.startsWith('emergency_')) {
            this.padTimer += delta * workSpeedMult;
            const progress = Math.min(1.0, this.padTimer / GAME_CONFIG.PAD.ACTION_DURATION);
            pad.setProgress(progress);

            if (this.padTimer >= GAME_CONFIG.PAD.ACTION_DURATION) {
                this.weatherManager.resolveEmergency();
                this.padTimer = 0;
                pad.setProgress(0);
            }
        }
    }

    // 경제 분당 매출 롤링 윈도우 계산
    updateEconomyMetrics(delta) {
        const now = Date.now();
        // 60초 지난 매출 기록 삭제
        this.state.revenueHistory = this.state.revenueHistory.filter(h => now - h.time <= 60000);
        
        // 최근 60초 총매출
        const sum = this.state.revenueHistory.reduce((acc, h) => acc + h.amount, 0);
        this.state.recentRevenuePerMin = sum;
    }
}

// 게임 인스턴스 초기화
window.addEventListener('DOMContentLoaded', () => {
    window.game = new LogisticsGame();
});
