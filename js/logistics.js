/**
 * 물류 파이프라인 (입고, 스캔, 분류대 3종, 출고 도크, 트럭) (logistics.js)
 */
class LogisticsSystem {
    constructor(scene) {
        this.scene = scene;

        // 발판 모음
        this.pads = {};

        // 입고 트럭 및 입고 도크
        this.inboundTruck = null;
        this.inboundDock = null;
        this.dockPackages = []; // 입고 도크에 쌓여있는 미스캔 박스
        this.inboundIntervalTimer = 0; // 다음 트럭 배차 쿨타임
        this.inboundDockCapacity = 10;
        this.outboundRackCapacity = 20; // 출고 선반 기본 용량 (20개)

        // 송장 스캔 테이블
        this.scanTable = null;
        this.scanPackages = []; // 스캔 테이블 위의 박스들

        // 분류대 3종 (대구, 부산, 서울)
        this.sortingTables = {};

        // 지역별 전용 출고 도크 렉 선반 및 출고 트럭 (대구, 부산, 서울)
        this.outboundRacks = {};
        this.outboundTrucks = {};
        this.outboundPackages = {
            daegu: [],
            busan: [],
            seoul: []
        };
        this.outboundPallets = [];  // 파렛트 묶음

        // 레거시 호환 편의 참조
        this.outboundDockMesh = null;

        // 컨베이어 벨트들
        this.conveyors = [];

        // 운반 카트 3대 및 지게차 2대 모음
        this.carts = [];
        this.forklifts = [];

        // 해금된 지역 목록
        this.unlockedRegions = ['daegu'];

        this.initWorld();
    }

    // 출고 선반 적재 용량 및 선반 단수 동적 갱신
    setOutboundRackCapacity(capacity) {
        this.outboundRackCapacity = capacity;
        ['daegu', 'busan', 'seoul'].forEach(r => {
            const rack = this.outboundRacks[r];
            if (rack && rack.updateRackShelves) {
                rack.updateRackShelves(capacity);
            }
            this.updateOutboundVisuals(r);
        });
    }

    // 레거시 코드 호환용 대구 트럭 getter/setter
    get outboundTruck() {
        return this.outboundTrucks.daegu;
    }
    set outboundTruck(val) {
        if (this.outboundTrucks) this.outboundTrucks.daegu = val;
    }

    initWorld() {
        const mf = window.modelFactory;

        // ==========================================
        // 1. 입고 트럭 및 정차 구역 (실외 좌측: X = -28)
        // ==========================================
        this.inboundTruck = mf.createTruck('inbound');
        this.inboundTruck.position.set(-28, 0, 0);
        this.inboundTruck.rotation.y = -Math.PI / 2; // 후진 정차 (동쪽을 바라봄)
        this.scene.add(this.inboundTruck);
        this.resetInboundTruckCargo();
        this.inboundTruck.userData.state = 'docked';

        // 트럭 앞 하차 원형 발판
        const truckUnloadPad = mf.createPad('truck_unload', 1.4, 0xffaa00, '하차');
        truckUnloadPad.position.set(-24.0, 0, 0);
        this.scene.add(truckUnloadPad);
        this.pads.truck_unload = truckUnloadPad;

        // ==========================================
        // 2. 입고 & 송장 스캔 통합 선반 (X = -15, Z = 0)
        //    선반 위쪽 발판에서 3초 송장 스캔 진행!
        // ==========================================
        this.inboundDock = mf.createInboundDock();
        this.inboundDock.position.set(-15, 0, 0);
        this.scene.add(this.inboundDock);

        // 왼쪽 발판 (택배 두기 전용: 트럭에서 가져와 선반에 올림)
        const dockPutPad = mf.createPad('dock_put', 1.2, 0x2ecc71, '선반 올리기');
        dockPutPad.position.set(-18.5, 0, 0);
        this.scene.add(dockPutPad);
        this.pads.dock_put = dockPutPad;

        // 위쪽 발판 (송장 스캔 전용: 3초 머무르면 선반 위 택배들 목적지 지정!)
        const scanActionPad = mf.createPad('scan_action', 1.2, 0xe74c3c, '송장 스캔');
        scanActionPad.position.set(-15, 0, -2.6);
        this.scene.add(scanActionPad);
        this.pads.scan_action = scanActionPad;

        // 오른쪽 발판 (택배 들기 전용: 스캔 완료된 택배를 꺼내어 분류대로 이동)
        const dockTakePad = mf.createPad('dock_take', 1.2, 0x3498db, '스캔품 들기');
        dockTakePad.position.set(-11.5, 0, 0);
        this.scene.add(dockTakePad);
        this.pads.dock_take = dockTakePad;

        // ==========================================
        // 3. 분류대 3종 (대구: Z=-7.5, 부산: Z=0.0, 서울: Z=7.5)
        //    가로 일직선 파이프라인 매핑: 분류대(X=0) -> 도크(X=11) -> 상차(X=16) -> 트럭(X=20)
        // ==========================================
        const sortingConfigs = [
            { region: 'daegu', z: -7.5 },
            { region: 'busan', z: 0.0 },
            { region: 'seoul', z: 7.5 }
        ];

        sortingConfigs.forEach(cfg => {
            const tbl = mf.createSortingTable(cfg.region);
            tbl.position.set(0, 0, cfg.z);
            this.scene.add(tbl);

            // 분류대 왼쪽 발판 (스캔 완료 택배 내려놓기)
            const regData = GAME_CONFIG.REGIONS[cfg.region];
            const colorName = cfg.region === 'daegu' ? '초록' : (cfg.region === 'busan' ? '파랑' : '빨강');
            const putPad = mf.createPad(`sort_put_${cfg.region}`, 1.15, regData.color, `${regData.name}(${colorName}) 적재`);
            putPad.position.set(-3.2, 0, cfg.z);
            this.scene.add(putPad);

            // 분류대 위쪽 발판 (3초 검수 상호작용)
            const inspectPad = mf.createPad(`sort_inspect_${cfg.region}`, 1.2, 0x9b59b6, '검수');
            inspectPad.position.set(0, 0, cfg.z - 2.0);
            this.scene.add(inspectPad);

            // 분류대 오른쪽 발판 (검수 완료 택배 들기)
            const takePad = mf.createPad(`sort_take_${cfg.region}`, 1.15, 0x2ecc71, '출고용 들기');
            takePad.position.set(3.2, 0, cfg.z);
            this.scene.add(takePad);

            // this.pads 딕셔너리에 등록
            this.pads[`sort_put_${cfg.region}`] = putPad;
            this.pads[`sort_inspect_${cfg.region}`] = inspectPad;
            this.pads[`sort_take_${cfg.region}`] = takePad;

            this.sortingTables[cfg.region] = {
                mesh: tbl,
                uninspected: [],
                inspected: [],
                pads: {
                    put: putPad,
                    inspect: inspectPad,
                    take: takePad,
                },
                config: GAME_CONFIG.REGIONS[cfg.region],
                visible: (cfg.region === 'daegu')
            };

            tbl.visible = (cfg.region === 'daegu');
            putPad.visible = (cfg.region === 'daegu');
            inspectPad.visible = (cfg.region === 'daegu');
            takePad.visible = (cfg.region === 'daegu');
        });

        // ==========================================
        // 4. [모듈 3 & 4] 지역별 전용 출고 렉 선반 & 좌/우 분리 발판 & 트럭 3대
        //    대구 (Z=-7.5, 주황), 부산 (Z=0.0, 파랑), 서울 (Z=7.5, 초록)
        // ==========================================
        const outboundConfigs = [
            { region: 'daegu', z: -7.5, padColor: 0xf39c12, name: '대구', unlocked: true },
            { region: 'busan', z: 0.0, padColor: 0x0088ff, name: '부산', unlocked: false },
            { region: 'seoul', z: 7.5, padColor: 0x2ecc71, name: '서울', unlocked: false }
        ];

        outboundConfigs.forEach(cfg => {
            const r = cfg.region;

            // 1. 가로형 철제 렉 선반 (Shelving Rack: X = 11.0, Z = cfg.z)
            const rack = mf.createOutboundRack(r);
            rack.position.set(11.0, 0, cfg.z);
            rack.visible = cfg.unlocked;
            this.scene.add(rack);
            this.outboundRacks[r] = rack;

            // 2. 좌측 발판 [출고 도크 두기] (X = 8.6, Z = cfg.z) - 내려놓기 전용
            const dockPutPad = mf.createPad(`outbound_dock_put_${r}`, 1.25, cfg.padColor, `${cfg.name} 도크 두기`);
            dockPutPad.position.set(8.6, 0, cfg.z);
            dockPutPad.visible = cfg.unlocked;
            this.scene.add(dockPutPad);
            this.pads[`outbound_dock_put_${r}`] = dockPutPad;
            this.pads[`outbound_dock_${r}`] = dockPutPad; // 레거시 호환

            // 3. 우측 발판 [출고 도크 꺼내기] (X = 13.4, Z = cfg.z) - 꺼내기(스마트 우선 픽업) 전용
            const dockTakePad = mf.createPad(`outbound_dock_take_${r}`, 1.25, 0x38bdf8, `${cfg.name} 도크 꺼내기`);
            dockTakePad.position.set(13.4, 0, cfg.z);
            dockTakePad.visible = cfg.unlocked;
            this.scene.add(dockTakePad);
            this.pads[`outbound_dock_take_${r}`] = dockTakePad;

            // 4. 트럭 직행 상차 발판 (X = 16.5, Z = cfg.z)
            const truckLoadPad = mf.createPad(`outbound_truck_load_${r}`, 1.3, 0x2ecc71, `${cfg.name} 트럭 상차 (직행)`);
            truckLoadPad.position.set(16.5, 0, cfg.z);
            truckLoadPad.visible = cfg.unlocked;
            this.scene.add(truckLoadPad);
            this.pads[`outbound_truck_load_${r}`] = truckLoadPad;

            // 5. 지역 전용 출고 배송 트럭 (X = 20.5, Z = cfg.z)
            const truck = mf.createTruck('outbound', r);
            truck.position.set(cfg.unlocked ? 20.5 : 200.0, 0, cfg.z);
            truck.rotation.y = Math.PI / 2; // 동쪽(오른쪽)을 바라봄
            truck.userData.baseZ = cfg.z;
            truck.userData.region = r;
            truck.userData.state = cfg.unlocked ? 'docked' : 'away';
            truck.userData.cargoList = [];
            truck.userData.autoDepartTimer = 0;
            truck.visible = cfg.unlocked;
            this.scene.add(truck);
            this.outboundTrucks[r] = truck;
        });

        // 레거시 호환 참조 설정
        this.pads.outbound_dock = this.pads.outbound_dock_put_daegu;
        this.pads.outbound_truck_load = this.pads.outbound_truck_load_daegu;

        // 🛒 [모듈 4] 운반 카트 3대 상시 배치 (창고 좌측 하단 X = -18, Z = 8 부근 좌우 나란히 3대)
        this.carts = [];
        const cartXOffsets = [-19.5, -18.0, -16.5];
        for (let i = 0; i < 3; i++) {
            const cart = mf.createCart();
            cart.position.set(cartXOffsets[i], 0, 8.0);
            cart.userData.basePos.set(cartXOffsets[i], 0, 8.0);
            this.scene.add(cart);
            this.carts.push(cart);
        }

        // 🚜 지게차 2대 배치: [출고 렉 선반과 출고 트럭 사이의 하역 구역] 전진 배치
        this.forklifts = [];
        const forkConfigs = [
            { x: 19.5, z: -3.5, rot: Math.PI },
            { x: 19.5, z: 3.5, rot: Math.PI }
        ];
        forkConfigs.forEach((cfg, idx) => {
            const fork = mf.createForklift();
            fork.position.set(cfg.x, 0, cfg.z);
            fork.rotation.y = cfg.rot;
            fork.userData.id = 'forklift_' + (idx + 1);
            fork.userData.speed = 4.8; // 묵직하고 안정적인 중장비 주행감
            fork.userData.spawnPos = new THREE.Vector3(cfg.x, 0, cfg.z);
            fork.userData.aiState = 'idle'; // 스마트 자율 주행 상태
            fork.userData.targetRegion = null;
            this.scene.add(fork);
            this.forklifts.push(fork);
        });

        // 🏢 [메가허브 3단계 전용 확장 하역장 바닥 & 벽체 메쉬] (가로 12m, 세로 28m)
        this.megahubGroup = new THREE.Group();
        this.megahubGroup.visible = false;

        // 확장 에폭시 하역장 바닥 (X = 21 ~ 33, 중심 X = 27)
        const extFloorGeo = new THREE.PlaneGeometry(12, 28);
        extFloorGeo.rotateX(-Math.PI / 2);
        const extFloorMat = new THREE.MeshLambertMaterial({ color: 0x2c524b });
        const extFloor = new THREE.Mesh(extFloorGeo, extFloorMat);
        extFloor.position.set(27.0, 0.005, 0);
        extFloor.receiveShadow = true;
        this.megahubGroup.add(extFloor);

        // 확장 하역장 안전 노란 라인
        const extLineGeo = new THREE.PlaneGeometry(11.6, 27.6);
        extLineGeo.rotateX(-Math.PI / 2);
        const extLineMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f, wireframe: true });
        const extLine = new THREE.Mesh(extLineGeo, extLineMat);
        extLine.position.set(27.0, 0.025, 0);
        this.megahubGroup.add(extLine);

        // 확장 북쪽 벽 (가로 12m, Z = -14)
        const wallMat = new THREE.MeshLambertMaterial({ color: 0x7f8c8d });
        const extNorthWall = new THREE.Mesh(new THREE.BoxGeometry(12, 6.0, 0.6), wallMat);
        extNorthWall.position.set(27.0, 3.0, -14);
        extNorthWall.castShadow = true;
        extNorthWall.receiveShadow = true;
        this.megahubGroup.add(extNorthWall);

        // 확장 남쪽 벽 (가로 12m, Z = 14)
        const extSouthWall = new THREE.Mesh(new THREE.BoxGeometry(12, 6.0, 0.6), wallMat);
        extSouthWall.position.set(27.0, 3.0, 14);
        extSouthWall.castShadow = true;
        extSouthWall.receiveShadow = true;
        this.megahubGroup.add(extSouthWall);

        // 확장 하역장 천장 보조 조명
        const extLight = new THREE.PointLight(0xfffaed, 1.2, 32);
        extLight.position.set(26.0, 12, 0);
        this.megahubGroup.add(extLight);

        this.scene.add(this.megahubGroup);

        this.facilityVehicles = new THREE.Group();
        this.scene.add(this.facilityVehicles);

        // 시설 티어별 차량 노출 초기화 (1단계: 카트/지게차 모두 숨김)
        this.updateFacilityVehicles(1);

        // ==========================================
        // 5. 긴급 미션 오브젝트 및 발판 3종 (기상 이벤트용)
        // ==========================================
        // 1. 제설 영역: 하차 영역(Z=0)과 겹치지 않게 실외 위쪽 (X = -26, Z = -9)
        const snowStation = mf.createEmergencyFacility('snow');
        snowStation.position.set(-26.0, 0, -9.0);
        this.scene.add(snowStation);
        this.snowStation = snowStation;

        const snowPad = mf.createPad('emergency_snow', 1.3, 0xef4444, '제설 작업');
        snowPad.position.set(-24.5, 0.35, -9.0); // 눈더미(0.32m) 위로 올라서서 선명하게 노출
        snowPad.visible = false;
        this.scene.add(snowPad);
        this.pads.emergency_snow = snowPad;

        // 2. 발전기 영역: 창고 실내 왼쪽 위 구석 모퉁이 (X = -18.5, Z = -11.5)
        const generatorFacility = mf.createEmergencyFacility('thunder');
        generatorFacility.position.set(-18.5, 0, -11.5);
        this.scene.add(generatorFacility);
        this.generatorFacility = generatorFacility;

        const thunderPad = mf.createPad('emergency_thunder', 1.3, 0xf39c12, '발전기 가동');
        thunderPad.position.set(-18.5, 0, -9.2);
        thunderPad.visible = false;
        this.scene.add(thunderPad);
        this.pads.emergency_thunder = thunderPad;

        // 3. 차수판 영역: 실외-실내 서쪽 셔터 출입구 옆 벽면 (X = -20.5, Z = -3.8)
        const rainStation = mf.createEmergencyFacility('rain');
        rainStation.position.set(-20.5, 0, -3.8);
        this.scene.add(rainStation);
        this.rainStation = rainStation;

        const rainPad = mf.createPad('emergency_rain', 1.3, 0x0984e3, '차수판 설치');
        rainPad.position.set(-20.5, 0, -2.0);
        rainPad.visible = false;
        this.scene.add(rainPad);
        this.pads.emergency_rain = rainPad;

        this.updateMissortWarningUI();
    }

    // 입고 트럭 화물 리셋 (새 트럭 도착 시 10개 완충)
    resetInboundTruckCargo() {
        const truck = this.inboundTruck;
        truck.userData.cargoList = [];
        for (let i = 0; i < GAME_CONFIG.INBOUND.TRUCK_CAPACITY; i++) {
            truck.userData.cargoList.push({
                id: 'pkg_' + Date.now() + '_' + i,
                region: null,       // 미스캔
                isInspected: false, // 미검수
            });
        }
        truck.userData.dockTimer = GAME_CONFIG.INBOUND.TRUCK_WAIT_TIME;
        truck.userData.earlyDepartTimer = 0;
        this.updateInboundTruckCargoVisual();
    }

    // 입고 트럭 적재함 3D 비주얼
    updateInboundTruckCargoVisual() {
        const group = this.inboundTruck.cargoSlotGroup;
        while (group.children.length > 0) {
            group.remove(group.children[0]);
        }

        const count = this.inboundTruck.userData.cargoList.length;
        for (let i = 0; i < count; i++) {
            const box = window.modelFactory.createPackageBox(null, false);
            // 2 x 5 배열
            const col = i % 2;
            const row = Math.floor(i / 2);
            box.position.set((col - 0.5) * 0.9, 0, (row - 2) * 0.8);
            group.add(box);
        }
    }

    // 입고 선반 3D 비주얼 (10개 단위로 1호기 1층 -> 1호기 2층 -> 2호기 1층 -> 2호기 2층)
    updateDockVisuals() {
        const group = this.inboundDock.packageContainer;
        while (group.children.length > 0) {
            group.remove(group.children[0]);
        }

        this.dockPackages.forEach((pkg, idx) => {
            const box = window.modelFactory.createPackageBox(pkg.region, false);
            
            let shelfY = 0.45;
            let zOffset = 0;

            if (idx < 10) {
                // 1호기 1단
                shelfY = 0.45;
                zOffset = 0;
            } else if (idx < 20) {
                // 1호기 2단
                shelfY = 1.45;
                zOffset = 0;
            } else if (idx < 30) {
                // 2호기 1단 (신설 렉)
                shelfY = 0.45;
                zOffset = 2.8;
            } else if (idx < 40) {
                // 2호기 2단
                shelfY = 1.45;
                zOffset = 2.8;
            } else {
                // 40개 초과 시 2호기 상단 적층
                const extraLayer = Math.floor((idx - 40) / 10) + 1;
                shelfY = 1.45 + (extraLayer * 0.52);
                zOffset = 2.8;
            }

            const localIdx = idx % 10;
            const x = ((localIdx % 5) - 2) * 0.75;
            const z = zOffset + (Math.floor(localIdx / 5) - 0.5) * 0.8;
            box.position.set(x, shelfY, z);
            group.add(box);
        });

        // 선반 위 적재 수량 3D 텍스트 실시간 동기화
        if (this.inboundDock.updateText) {
            this.inboundDock.updateText(this.dockPackages.length, this.inboundDockCapacity);
        }
    }

    // 스캔 테이블 3D 비주얼
    updateScanVisuals() {
        const group = this.scanTable.packageContainer;
        while (group.children.length > 0) {
            group.remove(group.children[0]);
        }

        this.scanPackages.forEach((pkg, idx) => {
            const box = window.modelFactory.createPackageBox(pkg.region, pkg.isInspected);
            const x = ((idx % 3) - 1) * 0.85;
            const z = (Math.floor(idx / 3) - 0.5) * 0.85;
            box.position.set(x, 0, z);
            group.add(box);
        });
    }

    // 분류대 3D 비주얼 (모듈 1: 2x2 = 4개 1층 다단 Y축 적층 시스템)
    updateSortingVisuals(regionKey) {
        const tbl = this.sortingTables[regionKey];
        if (!tbl) return;

        // 검수 전 컨테이너
        const unGroup = tbl.mesh.uninspectedContainer;
        while (unGroup.children.length > 0) {
            unGroup.remove(unGroup.children[0]);
        }
        tbl.uninspected.forEach((pkg, idx) => {
            const box = window.modelFactory.createPackageBox(pkg.region, false);
            const layer = Math.floor(idx / 4);         // 현재 적재 층 (0층, 1층, 2층...)
            const localIdx = idx % 4;                  // 층 내 인덱스 (0~3)
            const col = localIdx % 2;                  // X축 (0 또는 1)
            const row = Math.floor(localIdx / 2);      // Z축 (0 또는 1)

            const x = (col - 0.5) * 0.8;
            const y = 0.05 + (layer * 0.52);           // 위로 차곡차곡 쌓임
            const z = (row - 0.5) * 0.8;
            box.position.set(x, y, z);
            unGroup.add(box);
        });

        // 검수 완료 컨테이너
        const inGroup = tbl.mesh.inspectedContainer;
        while (inGroup.children.length > 0) {
            inGroup.remove(inGroup.children[0]);
        }
        tbl.inspected.forEach((pkg, idx) => {
            const box = window.modelFactory.createPackageBox(pkg.region, true, pkg.isMissorted || false, pkg.missortTruckPassCount || 0);
            const layer = Math.floor(idx / 4);         // 현재 적재 층 (0층, 1층, 2층...)
            const localIdx = idx % 4;                  // 층 내 인덱스 (0~3)
            const col = localIdx % 2;                  // X축 (0 또는 1)
            const row = Math.floor(localIdx / 2);      // Z축 (0 또는 1)

            const x = (col - 0.5) * 0.8;
            const y = 0.05 + (layer * 0.52);           // 위로 차곡차곡 쌓임
            const z = (row - 0.5) * 0.8;
            box.position.set(x, y, z);
            inGroup.add(box);
        });
    }

    // [모듈 3 & 6] 출고 도크 렉 선반 3D 비주얼 (선반 칸별 격자 배치 후 위로 다단 Y축 적층)
    updateOutboundVisuals(targetRegion = null) {
        const regions = targetRegion ? [targetRegion] : ['daegu', 'busan', 'seoul'];

        regions.forEach(r => {
            const rack = this.outboundRacks ? this.outboundRacks[r] : null;
            if (!rack || !rack.packageContainer) return;

            const container = rack.packageContainer;
            while (container.children.length > 0) {
                container.remove(container.children[0]);
            }

            const pkgs = this.outboundPackages[r] || [];
            let normalCount = 0;
            let missortCount = 0;

            pkgs.forEach((pkg, idx) => {
                if (pkg.isMissorted) missortCount++;
                else normalCount++;

                let box;
                if (pkg.isPallet) {
                    box = window.modelFactory.createPallet(pkg.region, true);
                    box.scale.set(0.7, 0.7, 0.7);
                } else {
                    box = window.modelFactory.createPackageBox(
                        pkg.region, 
                        true, 
                        pkg.isMissorted || false, 
                        pkg.missortTruckPassCount || 0
                    );
                }
                box.userData.isBoxVisual = true;

                // [모듈 3 & 4] 입고렉과 동일하게 층당 10개 (가로 5 x 세로 2 = 10개) 다단 적층
                const layer = Math.floor(idx / 10);
                const localIdx = idx % 10;
                const col = localIdx % 5; // X축 (0, 1, 2, 3, 4)
                const row = Math.floor(localIdx / 5); // Z축 (0, 1)

                const x = (col - 2) * 0.75;
                const y = 0.35 + (layer * 0.95);
                const z = (row - 0.5) * 0.8;
                box.position.set(x, y, z);
                container.add(box);
            });

            // 렉 선반 상단 간판 갱신
            if (rack.updateRackLabel) {
                rack.updateRackLabel(normalCount, missortCount, this.outboundRackCapacity);
            }
        });

        // UI에 오분류 발생 여부 전달하여 좌측 경고 배너 제어
        this.updateMissortWarningUI();
    }

    // [모듈 7] 화면 좌측 오분류 경고 배너 실시간 제어
    updateMissortWarningUI() {
        const warningEl = document.getElementById('missort-warning-panel');
        if (!warningEl) return;

        let hasMissorted = false;
        ['daegu', 'busan', 'seoul'].forEach(r => {
            const list = this.outboundPackages[r] || [];
            if (list.some(p => p.isMissorted)) {
                hasMissorted = true;
            }
        });

        if (hasMissorted) {
            warningEl.classList.remove('hidden');
        } else {
            warningEl.classList.add('hidden');
        }
    }

    // 지역별 출고 트럭 적재함 3D 비주얼 (개수 계산 및 스프라이트/UI만 처리, 오브젝트는 비움)
    updateOutboundTruckCargoVisual(regionKey = null) {
        const regions = regionKey ? [regionKey] : Object.keys(this.outboundTrucks);

        regions.forEach(r => {
            const truck = this.outboundTrucks[r];
            if (!truck) return;

            // 트럭에 실린 택배/파렛트 오브젝트는 삭제 (적재함 뚫고 나감 방지 및 최적화)
            const group = truck.cargoSlotGroup;
            if (group) {
                while (group.children.length > 0) {
                    group.remove(group.children[0]);
                }
            }

            const list = truck.userData.cargoList;

            // 트럭 상단 3D 상태 스프라이트 갱신
            if (truck.updateStatusLabel) {
                truck.updateStatusLabel(list.length, truck.userData.capacity, truck.userData.autoDepartTimer || 0);
            }

            // 상단 출발 버튼 UI 갱신 알림
            if (window.gameUI) {
                window.gameUI.updateOutboundTruckButton(truck);
            }
        });
    }

    // 지역 해금 처리 (트럭, 완충 도크, 상차 발판 동시 활성화)
    unlockRegion(regionKey) {
        if (this.unlockedRegions.includes(regionKey)) return;
        this.unlockedRegions.push(regionKey);

        const tbl = this.sortingTables[regionKey];
        if (tbl) {
            tbl.visible = true;
            tbl.mesh.visible = true;
            tbl.pads.put.visible = true;
            tbl.pads.inspect.visible = true;
            tbl.pads.take.visible = true;
        }

        // 해당 지역 출고 렉 선반 및 좌/우 분리 발판, 트럭 상차 발판 활성화
        if (this.outboundRacks && this.outboundRacks[regionKey]) {
            this.outboundRacks[regionKey].visible = true;
        }
        if (this.pads[`outbound_dock_put_${regionKey}`]) {
            this.pads[`outbound_dock_put_${regionKey}`].visible = true;
        }
        if (this.pads[`outbound_dock_take_${regionKey}`]) {
            this.pads[`outbound_dock_take_${regionKey}`].visible = true;
        }
        if (this.pads[`outbound_dock_${regionKey}`]) {
            this.pads[`outbound_dock_${regionKey}`].visible = true;
        }
        if (this.pads[`outbound_truck_load_${regionKey}`]) {
            this.pads[`outbound_truck_load_${regionKey}`].visible = true;
        }

        // 해당 지역 출고 트럭 활성화 및 진입 애니메이션
        const truck = this.outboundTrucks[regionKey];
        if (truck) {
            truck.visible = true;
            truck.userData.state = 'arriving';
            truck.userData.cargoList = [];
            truck.userData.autoDepartTimer = 0;
            truck.position.set(52, 0, truck.userData.baseZ);
            this.updateOutboundTruckCargoVisual(regionKey);
        }

        if (window.soundManager) window.soundManager.playJackpot();
        if (window.gameUI) {
            const name = GAME_CONFIG.REGIONS[regionKey].name;
            window.gameUI.showNotification(`🚀 [${name}] 전용 배송 노선 및 출고 트럭이 활성화되었습니다!`, '#2ecc71');
            window.gameUI.renderUpgradeModal();
            if (truck) window.gameUI.updateOutboundTruckButton(truck);
        }
    }

    getUnlockedRegions() {
        return this.unlockedRegions;
    }

    // 입고 선반 스캔 액션 (위쪽 발판에서 3초 서있으면 선반 위 택배들 송장 목적지 라벨 부착!)
    processScanTableAction() {
        let scannedCount = 0;
        this.dockPackages.forEach(pkg => {
            if (!pkg.region) {
                // 해금된 지역 중 랜덤 지정!
                const pool = this.unlockedRegions;
                const chosen = pool[Math.floor(Math.random() * pool.length)];
                pkg.region = chosen;
                scannedCount++;
            }
        });

        if (scannedCount > 0) {
            if (window.soundManager) window.soundManager.playScan();
            this.updateDockVisuals();
            if (window.gameUI) {
                window.gameUI.showNotification(`📦 ${scannedCount}개 택배의 송장 스캔 완료!`, '#3498db');
            }
        }
    }

    // 분류대 검수 액션 (3초 완료 시 상단에서 하단으로 자동 슬라이드 이동!)
    // [모듈 7-4] 분류대 검수 액션 (베테랑 검수알바 시 오분류 자동 복구)
    processSortingInspect(regionKey, isVeteran = false) {
        const tbl = this.sortingTables[regionKey];
        if (!tbl || tbl.uninspected.length === 0) return;

        let inspectedCount = 0;
        let missortedCount = 0;
        let veteranRecoveredCount = 0;

        while (tbl.uninspected.length > 0) {
            const pkg = tbl.uninspected.shift();

            // 목적지와 분류대가 일치하지 않는 경우
            if (pkg.region && pkg.region !== regionKey) {
                if (isVeteran) {
                    // [모듈 7-4] 베테랑 검수알바: 오분류 즉시 감지하여 원래 색상으로 자동 복구!
                    pkg.isMissorted = false;
                    pkg.isInspected = false;
                    pkg.recoveredByVeteran = true;
                    pkg.missortTruckPassCount = 0;
                    veteranRecoveredCount++;
                } else {
                    pkg.isInspected = true;
                    pkg.isMissorted = true;
                    pkg.missortTruckPassCount = 0;
                    missortedCount++;
                }
            } else {
                pkg.isInspected = true;
                pkg.isMissorted = false;
            }
            tbl.inspected.push(pkg);
            inspectedCount++;
        }

        if (inspectedCount > 0) {
            if (window.soundManager) window.soundManager.playInspectComplete();
            this.updateSortingVisuals(regionKey);
            const regName = GAME_CONFIG.REGIONS[regionKey].name;
            if (window.gameUI) {
                if (veteranRecoveredCount > 0) {
                    window.gameUI.showNotification(`👑 [${regName}] 베테랑 검수원! 오분류 ${veteranRecoveredCount}건을 자동 복구하여 올바른 지역 분류대로 역이동시킵니다.`, '#f1c40f');
                } else if (missortedCount > 0) {
                    window.gameUI.showNotification(`⚠️ [${regName}] 검수 완료! 오분류 택배 ${missortedCount}건이 감지되어 출고 도크로 이동됩니다.`, '#e74c3c');
                } else {
                    window.gameUI.showNotification(`✅ [${regName}] 검수 완료! 출고 대기 구역으로 이동되었습니다.`, '#2ecc71');
                }
            }
        }
    }

    // 시설 규모에 따른 장비 상태 관리
    updateFacilityVehicles(tier) {
        // 카트 3대와 지게차 2대는 창고 내 상시 배치되어 바로 탑승/운용 가능합니다.
    }

    // 지게차 8개 완충 파렛트 출고 도크 적치 (트럭 1칸 차지하는 묶음 파렛트로 변환)
    dockForkliftPallet(regionKey, pallet) {
        if (!this.outboundPackages[regionKey]) {
            this.outboundPackages[regionKey] = [];
        }
        this.outboundPackages[regionKey].push(pallet);
        this.updateOutboundVisuals(regionKey);
        if (window.soundManager) window.soundManager.playJackpot();
        if (window.gameUI) {
            const name = GAME_CONFIG.REGIONS[regionKey] ? GAME_CONFIG.REGIONS[regionKey].name : regionKey;
            window.gameUI.showNotification(`📦 [${name}] 지게차 파렛트 적재 완료! (택배 8개 분량 압축 적치)`, '#f1c40f');
        }
    }

    // 파렛트 묶음 생성 (정상 택배 8개 묶음 -> 1개 파렛트)
    packPalletFromOutbound(regionKey = 'daegu') {
        const pkgsList = this.outboundPackages[regionKey] || this.outboundPackages.daegu;
        const normalPackages = pkgsList.filter(p => !p.isMissorted);
        if (normalPackages.length < GAME_CONFIG.OUTBOUND.PALLET_PACKAGE_COUNT) {
            return false;
        }

        // 정상 택배 8개 추출
        const pkgs = [];
        for (let i = pkgsList.length - 1; i >= 0 && pkgs.length < GAME_CONFIG.OUTBOUND.PALLET_PACKAGE_COUNT; i--) {
            if (!pkgsList[i].isMissorted) {
                pkgs.push(pkgsList.splice(i, 1)[0]);
            }
        }
        const region = pkgs[0].region || regionKey || 'daegu';

        const pallet = {
            id: 'pallet_' + Date.now(),
            isPallet: true,
            packageCount: 8,
            region: region,
            isInspected: true,
        };

        this.outboundPackages[region].push(pallet);
        this.updateOutboundVisuals(region);
        if (window.soundManager) window.soundManager.playJackpot();
        return pallet;
    }

    // 파렛트 발판 시각화 (호환성 유지용 no-op)
    updatePalletPadVisuals() {
        // 독립 pallet_pack 발판 철거 완료됨
    }

    // 출고 배송 트럭 수동/자동 출발 트리거
    departOutboundTruck(regionKey = 'daegu', gameState = null) {
        // 하위 호환: 첫 번째 인자가 gameState 객체로 넘어온 경우
        if (typeof regionKey === 'object' && regionKey !== null) {
            gameState = regionKey;
            regionKey = 'daegu';
        }
        if (!gameState && window.game) {
            gameState = window.game.state;
        }

        const truck = this.outboundTrucks[regionKey] || this.outboundTrucks.daegu;
        if (!truck || truck.userData.state !== 'docked') return false;

        const cargo = truck.userData.cargoList;
        // 총 택배 수 환산 (파렛트는 8개로 판정)
        let totalCount = 0;
        let weightedPriceSum = 0;

        cargo.forEach(item => {
            const cnt = item.isPallet ? item.packageCount : 1;
            const regConfig = GAME_CONFIG.REGIONS[item.region] || GAME_CONFIG.REGIONS[regionKey] || GAME_CONFIG.REGIONS.daegu;
            const feverMultiplier = (gameState && gameState.isFeverTime ? GAME_CONFIG.FEVER_TIME.PROFIT_MULTIPLIER : 1.0);
            const nightMultiplier = (gameState && gameState.isNight ? (GAME_CONFIG.NIGHT_SHIFT ? GAME_CONFIG.NIGHT_SHIFT.PROFIT_MULTIPLIER : 1.5) : 1.0);
            const multiplier = regConfig.multiplier * feverMultiplier * nightMultiplier;
            
            totalCount += cnt;
            weightedPriceSum += (cnt * GAME_CONFIG.OUTBOUND.BASE_PRICE * multiplier);
        });

        // 출발 최소 조건: 5개 이상 적재 (단, 만차 시 cargo.length = 10이므로 즉시 충족)
        if (totalCount < GAME_CONFIG.OUTBOUND.MIN_DEPARTURE_COUNT && cargo.length < 1) {
            if (window.gameUI) window.gameUI.showNotification('최소 5개 이상의 택배를 적재해야 출발할 수 있습니다!', '#e74c3c');
            return false;
        }

        // 정산 공식: (택배 수 * 단가 * 배율) - 기름값
        let revenue = Math.round(weightedPriceSum - GAME_CONFIG.OUTBOUND.FUEL_COST);
        let bonus = 0;

        // 알뜰적재 판정 (슬롯 10개 만차)
        const isFullLoad = (cargo.length >= truck.userData.capacity);
        if (isFullLoad && gameState) {
            bonus = GAME_CONFIG.OUTBOUND.FULL_LOAD_BONUS;
            gameState.reputation += GAME_CONFIG.OUTBOUND.FULL_LOAD_REPUTATION;
            if (window.soundManager) window.soundManager.playJackpot();
            if (window.gameUI) {
                const regName = GAME_CONFIG.REGIONS[regionKey].name;
                window.gameUI.showNotification(`⭐ [${regName}] 알뜰적재 달성! 보너스 +${bonus.toLocaleString()}원 & 평판 상승!`, '#f1c40f');
            }
        }

        const totalEarned = revenue + bonus;
        if (gameState) {
            gameState.money += totalEarned;
            gameState.totalRevenueEarned += totalEarned;
            gameState.totalShippedPackages += totalCount;
            if (gameState.revenueHistory) {
                gameState.revenueHistory.push({ time: Date.now(), amount: totalEarned });
            }
        }

        if (window.soundManager) window.soundManager.playHorn();

        // [모듈 7] 출고 도크에 남아있는 오분류 택배 카운트 증가 및 3번째 트럭 출발 시 강제 오배송 적재
        const dockPkgs = this.outboundPackages[regionKey] || [];
        let misshipCount = 0;
        const maxPasses = (GAME_CONFIG.MISSORT && GAME_CONFIG.MISSORT.MAX_TRUCK_PASSES) || 3;

        for (let i = dockPkgs.length - 1; i >= 0; i--) {
            const pkg = dockPkgs[i];
            if (pkg.isMissorted) {
                pkg.missortTruckPassCount = (pkg.missortTruckPassCount || 0) + 1;
                // 3번째 트럭 출발 시: 검정색 상자가 트럭에 강제로 함께 실려 오배송 출발!
                if (pkg.missortTruckPassCount >= maxPasses) {
                    dockPkgs.splice(i, 1);
                    cargo.push(pkg); // 트럭에 강제 상차
                    misshipCount++;
                }
            }
        }

        // 오배송 사고 발생 시 페널티 (평판 -10 / 클레임 벌금 -500원 즉시 차감 및 사이렌)
        if (misshipCount > 0) {
            const penaltyMoney = misshipCount * 500;
            const penaltyReputation = misshipCount * 10;
            if (gameState) {
                gameState.money = Math.max(0, gameState.money - penaltyMoney);
                gameState.reputation = Math.max(0, gameState.reputation - penaltyReputation);
            }
            if (window.soundManager) window.soundManager.playAlarm();
            if (window.gameUI) {
                const regName = GAME_CONFIG.REGIONS[regionKey].name;
                window.gameUI.showNotification(`🚨 [오배송 사고 발생!] ${regName}행 트럭에 오분류 택배 ${misshipCount}건이 강제 적재되어 배송되었습니다! (평판 -${penaltyReputation}, 벌금 -${penaltyMoney.toLocaleString()}원)`, '#ef4444');
            }
        }
        this.updateOutboundVisuals(regionKey);

        // 트럭 출발 상태로 전환
        truck.userData.state = 'departing';
        truck.userData.departTimer = 0;
        truck.userData.autoDepartTimer = 0;

        if (window.gameUI) {
            const regName = GAME_CONFIG.REGIONS[regionKey].name;
            window.gameUI.showNotification(`🚚 [${regName}] 출고 트럭 출발! 정산액: +${totalEarned.toLocaleString()}원`, '#2ecc71');
            window.gameUI.updateHUD();
            window.gameUI.updateOutboundTruckButton(truck);
        }

        return true;
    }

    // 메인 업데이트 루프
    update(delta, gameState, weatherManager) {
        const canInbound = weatherManager ? weatherManager.canInboundOperate() : true;

        // 1. 입고 트럭 FSM 업데이트
        this.updateInboundTruck(delta, gameState, canInbound);

        // 2. 출고 트럭 3대 FSM 및 10개 만차 자동 출발(Auto-Depart) 업데이트
        this.updateOutboundTruck(delta, gameState);

        // 3. 컨베이어 벨트 자동 이송 (시설 규모 레벨 2 이상 시 활성화)
        this.updateConveyorBelts(delta, gameState);

        // 4. [메가허브 3단계] 스마트 지게차 8개 파렛트 우선 상차 FSM
        this.updateAutonomousForklifts(delta, gameState);
    }

    // 입고 트럭 루프 (X축 좌우 이동: 왼쪽 진입 -> X=-36 정차 -> 왼쪽 퇴장)
    updateInboundTruck(delta, gameState, canInbound) {
        const truck = this.inboundTruck;

        // 기상 악화(폭설 미제설) 시 트럭 진입 대기
        if (!canInbound && truck.userData.state === 'away') {
            return;
        }

        if (truck.userData.state === 'docked') {
            // [모듈 2] 하차 완료 시 즉시 회차: 적재함이 비면 20초를 기다리지 않고 0.5초 뒤 바로 출발(회차)!
            if (truck.userData.cargoList.length === 0) {
                truck.userData.earlyDepartTimer = (truck.userData.earlyDepartTimer || 0) + delta;
                if (truck.userData.earlyDepartTimer >= 0.5) {
                    truck.userData.earlyDepartTimer = 0;
                    truck.userData.state = 'departing';
                    if (window.soundManager) window.soundManager.playHorn();
                    if (window.gameUI) {
                        window.gameUI.showNotification(`⚡ 모든 하차 완료! 입고 트럭이 즉시 회차합니다.`, '#3498db');
                    }
                    return;
                }
            } else {
                truck.userData.earlyDepartTimer = 0;
            }

            // 20초 대기 카운트다운
            truck.userData.dockTimer -= delta;
            if (truck.userData.dockTimer <= 0) {
                // 20초 대기 후 회차: 남은 택배 그대로 실은 채 왼쪽(-X)으로 출발 회차!
                truck.userData.state = 'departing';
                if (window.soundManager) window.soundManager.playHorn();
                if (window.gameUI) {
                    const remain = truck.userData.cargoList.length;
                    if (remain > 0) {
                        window.gameUI.showNotification(`⏱️ 트럭 대기시간 종료! 잔여 택배 ${remain}개를 실은 채 회차합니다.`, '#e67e22');
                    } else {
                        window.gameUI.showNotification(`🚚 하차 완료! 입고 트럭이 회차합니다.`, '#3498db');
                    }
                }
            }
        } else if (truck.userData.state === 'departing') {
            // 앞머리가 향한 왼쪽(-X)으로 전진 퇴장
            truck.position.x -= delta * 18;
            if (truck.position.x < -52) {
                truck.userData.state = 'away';
                truck.position.set(-200, 0, 0); // 화면 밖으로 완전히 격리
                // 배차 쿨타임 시작
                let interval = GAME_CONFIG.INBOUND.INTERVAL_LEVELS[gameState.truckIntervalLevel - 1];
                if (gameState.isFeverTime) {
                    interval *= GAME_CONFIG.FEVER_TIME.TRUCK_INTERVAL_RATIO;
                }
                this.inboundIntervalTimer = interval;
            }
        } else if (truck.userData.state === 'away') {
            // 쿨타임 대기 후 다음 트럭 후진 진입
            this.inboundIntervalTimer -= delta;
            if (this.inboundIntervalTimer <= 0 && canInbound) {
                truck.userData.state = 'arriving';
                truck.position.set(-52, 0, 0); // 화면 왼쪽 바깥에서 출발
                this.resetInboundTruckCargo(); // 화물 리셋 (state는 계속 'arriving')
            }
        } else if (truck.userData.state === 'arriving') {
            // 후진(reverse)으로 왼쪽에서 오른쪽(+X)으로 정차 구역(-28)까지 진입
            truck.position.x += delta * 14;
            if (truck.position.x >= -28) {
                truck.position.x = -28;
                truck.userData.state = 'docked';
                truck.userData.dockTimer = GAME_CONFIG.INBOUND.TRUCK_WAIT_TIME;
                if (window.soundManager) window.soundManager.playHorn();
                if (window.gameUI) {
                    window.gameUI.showNotification('🚛 새로운 입고 배송 트럭이 도착했습니다! (택배 10개)', '#3498db');
                }
            }
        }
    }

    // 출고 트럭 3대 루프 (지역별 트럭 FSM 및 10개 만차 시 2초 자동 출발)
    updateOutboundTruck(delta, gameState) {
        const unlocked = this.getUnlockedRegions();
        const targetStopX = (gameState && gameState.warehouseTier >= 3) ? 28.5 : 20.5;

        unlocked.forEach(r => {
            const truck = this.outboundTrucks[r];
            if (!truck) return;

            const baseZ = truck.userData.baseZ || 0;
            truck.userData.baseX = targetStopX;

            if (truck.userData.state === 'docked') {
                const isFull = (truck.userData.cargoList.length >= truck.userData.capacity);

                if (isFull) {
                    // 10개 완충 시 자동 출발 (Auto-Depart): 2초 카운트다운
                    truck.userData.autoDepartTimer = (truck.userData.autoDepartTimer || 0) + delta;
                    if (truck.updateStatusLabel) {
                        truck.updateStatusLabel(truck.userData.cargoList.length, truck.userData.capacity, truck.userData.autoDepartTimer);
                    }

                    if (truck.userData.autoDepartTimer >= 2.0) {
                        truck.userData.autoDepartTimer = 0;
                        this.departOutboundTruck(r, gameState);
                    }
                } else {
                    truck.userData.autoDepartTimer = 0;
                }
            } else if (truck.userData.state === 'departing') {
                // 앞머리가 향한 오른쪽(+X)으로 전진 퇴장 (메가허브 확장 고려 X > 65)
                truck.position.x += delta * 20;
                if (truck.position.x > 65) {
                    truck.userData.state = 'away';
                    truck.position.set(200, 0, baseZ); // 화면 밖으로 격리
                    truck.userData.awayTimer = 6;      // 6초 후 새 트럭
                }
            } else if (truck.userData.state === 'away') {
                truck.userData.awayTimer -= delta;
                if (truck.userData.awayTimer <= 0) {
                    truck.userData.state = 'arriving';
                    truck.userData.cargoList = [];
                    truck.userData.autoDepartTimer = 0;
                    truck.position.set(65, 0, baseZ); // 화면 오른쪽 바깥에서 출발
                    this.updateOutboundTruckCargoVisual(r);
                }
            } else if (truck.userData.state === 'arriving') {
                // 후진(reverse)으로 오른쪽에서 왼쪽(-X)으로 정차 구역까지 진입
                truck.position.x -= delta * 14;
                if (truck.position.x <= targetStopX) {
                    truck.position.x = targetStopX;
                    truck.position.z = baseZ;
                    truck.userData.state = 'docked';
                    truck.userData.autoDepartTimer = 0;
                    this.updateOutboundTruckCargoVisual(r);
                    if (window.gameUI) {
                        const name = GAME_CONFIG.REGIONS[r].name;
                        window.gameUI.showNotification(`🚚 [${name}] 새로운 출고 배송 트럭이 대기 중입니다.`, '#2ecc71');
                    }
                }
            }
        });
    }

    // 컨베이어 벨트 자동 이송 (시설 레벨 2 이상 시)
    updateConveyorBelts(delta, gameState) {
        if (gameState.warehouseTier < 2) return;

        // 해금된 각 분류대의 검수 완료 택배를 일정 주기로 해당 지역 완충 도크로 자동 운반
        this.conveyorTimer = (this.conveyorTimer || 0) + delta;
        const interval = 4.0 / GAME_CONFIG.CONVEYOR_SPEED_LEVELS[gameState.conveyorLevel - 1];

        if (this.conveyorTimer >= interval) {
            this.conveyorTimer = 0;
            const unlocked = this.getUnlockedRegions();
            for (const r of unlocked) {
                const tbl = this.sortingTables[r];
                if (tbl && tbl.inspected.length > 0) {
                    const pkg = tbl.inspected.shift();
                    const destRegion = pkg.region || r;
                    if (!this.outboundPackages[destRegion]) this.outboundPackages[destRegion] = [];
                    this.outboundPackages[destRegion].push(pkg);
                    this.updateSortingVisuals(r);
                    this.updateOutboundVisuals(destRegion);
                    break;
                }
            }
        }
    }

    // 시설 티어별 차량 및 메가허브 확장 하역장 해금
    updateFacilityVehicles(tier = 1) {
        const hasCart = tier >= 2;
        const hasMegahub = tier >= 3;

        // 1. 카트 3대 노출
        if (this.carts) {
            this.carts.forEach(cart => {
                cart.visible = hasCart;
            });
        }

        // 2. 지게차 2대 노출
        if (this.forklifts) {
            this.forklifts.forEach(fork => {
                fork.visible = hasMegahub;
                if (!hasMegahub) {
                    fork.userData.cargoList = [];
                    fork.userData.aiState = 'idle';
                    fork.userData.targetRegion = null;
                    if (fork.updateVisual) fork.updateVisual();
                }
            });
        }

        // 3. 메가허브 전용 확장 하역장 (3단계 시 바닥/벽체 8m 확장 & 트럭/발판 우측 이동)
        if (this.megahubGroup) {
            this.megahubGroup.visible = hasMegahub;
        }

        // 출고 트럭 정차 위치 및 상차 발판 X 좌표 설정
        // 기본 1~2단계: 상차 발판 X = 16.5, 트럭 X = 20.5
        // 3단계 메가허브: 상차 발판 X = 25.0, 트럭 X = 28.5 (우측 약 8m 확장)
        const loadPadX = hasMegahub ? 25.0 : 16.5;
        const truckStopX = hasMegahub ? 28.5 : 20.5;

        ['daegu', 'busan', 'seoul'].forEach(r => {
            const pad = this.pads[`outbound_truck_load_${r}`];
            if (pad) {
                pad.position.x = loadPadX;
            }
            const truck = this.outboundTrucks[r];
            if (truck) {
                truck.userData.baseX = truckStopX;
                if (truck.userData.state === 'docked') {
                    truck.position.x = truckStopX;
                }
            }
        });
    }

    // [메가허브 3단계 전용] 알바 탑승 지게차 8개 파렛트 상차 FSM (무인 자율주행 금지: 운전자 탑승 시에만 구동)
    updateAutonomousForklifts(delta, gameState) {
        if (!gameState || gameState.warehouseTier < 3 || !this.forklifts) return;

        this.forklifts.forEach(fork => {
            // 지게차 자체는 자동으로 움직이지 않음: 운전자가 없거나 플레이어가 직접 운전 중이면 AI 자동 이동 스킵!
            if (!fork.visible || !fork.userData.driver || fork.userData.driver.isPlayer) return;

            const driverWorker = fork.userData.driver;
            const speed = fork.userData.speed || 4.8;
            const cargo = fork.userData.cargoList;
            const spawnPos = fork.userData.spawnPos;

            // 알바 캐릭터 위치를 지게차 운전석에 동기화
            if (driverWorker && driverWorker.mesh) {
                driverWorker.mesh.position.set(fork.position.x, fork.position.y + 0.55, fork.position.z - 0.2);
                driverWorker.mesh.rotation.y = fork.rotation.y;
            }

            if (fork.userData.aiState === 'moving_to_rack') {
                const r = fork.userData.targetRegion;
                if (!r) {
                    fork.userData.aiState = 'returning_home';
                    return;
                }
                const rackZ = r === 'daegu' ? -8 : (r === 'busan' ? 0 : 8);
                const targetPos = new THREE.Vector3(14.5, 0, rackZ);

                if (this.moveForkliftTowards(fork, targetPos, speed, delta)) {
                    // 도착: 렉 선반에서 정상 택배 8개 추출하여 목재 파렛트 1개(2x2x2)로 뜸!
                    const dockPkgs = this.outboundPackages[r] || [];
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
                        fork.updateVisual();
                        this.updateOutboundVisuals(r);
                        if (window.soundManager) window.soundManager.playPickup();

                        fork.userData.aiState = 'moving_to_truck';
                    } else {
                        // 8개 미달 시 다시 복귀
                        dockPkgs.push(...extracted);
                        fork.userData.aiState = 'returning_home';
                    }
                }
            } else if (fork.userData.aiState === 'moving_to_truck') {
                const r = fork.userData.targetRegion;
                const truck = this.outboundTrucks[r];
                const rackZ = r === 'daegu' ? -8 : (r === 'busan' ? 0 : 8);
                const loadPadX = (gameState.warehouseTier >= 3) ? 25.0 : 16.5;
                const targetPos = new THREE.Vector3(loadPadX, 0, rackZ);

                if (this.moveForkliftTowards(fork, targetPos, speed, delta)) {
                    // 도착: 트럭에 파렛트 1칸 상차!
                    if (truck && truck.userData.state === 'docked' && truck.userData.cargoList.length < truck.userData.capacity) {
                        while (cargo.length > 0) {
                            const p = cargo.pop();
                            truck.userData.cargoList.push(p);
                        }
                        fork.updateVisual();
                        this.updateOutboundTruckCargoVisual(r);
                        if (window.soundManager) window.soundManager.playDrop();
                        if (window.gameUI) {
                            const name = GAME_CONFIG.REGIONS[r].name;
                            window.gameUI.showNotification(`🚜 [${name}] 상차 알바(${driverWorker.name || '알바'})가 지게차로 파렛트(8개) 상차를 완료했습니다!`, '#f1c40f');
                            window.gameUI.updateOutboundTruckButton(truck);
                            window.gameUI.updateHUD();
                        }
                    }

                    // 상차 후 추가 8개 이상인 곳이 있는지 확인
                    const unlocked = this.getUnlockedRegions();
                    let nextRegion = null;
                    for (const nr of unlocked) {
                        const dPkgs = this.outboundPackages[nr] || [];
                        const trk = this.outboundTrucks[nr];
                        if (dPkgs.filter(p => !p.isMissorted).length >= 8 && trk && trk.userData.state === 'docked' && trk.userData.cargoList.length < trk.userData.capacity) {
                            nextRegion = nr;
                            break;
                        }
                    }

                    if (nextRegion) {
                        fork.userData.targetRegion = nextRegion;
                        fork.userData.aiState = 'moving_to_rack';
                    } else {
                        fork.userData.aiState = 'returning_home';
                    }
                }
            } else if (fork.userData.aiState === 'returning_home') {
                // 원래 스폰 대기 구역(spawnPos)으로 복귀
                if (this.moveForkliftTowards(fork, spawnPos, speed, delta)) {
                    fork.userData.aiState = 'idle';
                    fork.userData.targetRegion = null;
                    fork.rotation.y = Math.PI; // 서쪽을 바라보며 대기
                    
                    // 주차장에 도착하면 알바 하차!
                    if (window.game && window.game.workerManager) {
                        window.game.workerManager.unboardForklift(driverWorker, fork);
                    } else {
                        fork.userData.driver = null;
                    }
                }
            }
        });
    }

    // 지게차 3D 좌표 이동 헬퍼
    moveForkliftTowards(fork, targetVec3, speed, delta, arriveDist = 0.4) {
        const diffX = targetVec3.x - fork.position.x;
        const diffZ = targetVec3.z - fork.position.z;
        const dist = Math.sqrt(diffX * diffX + diffZ * diffZ);

        if (dist <= arriveDist) {
            return true;
        }

        const step = Math.min(dist, speed * delta);
        fork.position.x += (diffX / dist) * step;
        fork.position.z += (diffZ / dist) * step;
        fork.rotation.y = Math.atan2(diffX, diffZ);
        return false;
    }
}

window.LogisticsSystem = LogisticsSystem;
