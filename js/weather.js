/**
 * 기상 시스템 및 긴급 이벤트 매니저 (weather.js)
 */
class WeatherManager {
    constructor(scene) {
        this.scene = scene;
        this.currentWeather = 'clear'; // clear, snow, rain, thunder
        this.weatherTimer = 0;         // 기상 악화 남은 시간 (최대 120초)
        this.clearDaysCount = 0;       // 맑은 날 지속 카운트 (5일 달성 시 다음날 확정 악화)
        this.dailyEmergencyCount = 0;  // 하루 긴급 작업 발생 횟수 (최대 2회)
        this.isEmergencyActive = false;// 긴급 작업 발령 여부 (시작 후 20~40초 뒤 발령)
        this.isEmergencyResolved = false; // 해당 기상의 긴급 조치 완료 여부
        this.emergencyDelayTimer = 0;  // 긴급 작업 발령 대기 타이머

        // 파티클 시스템
        this.snowParticles = null;
        this.rainParticles = null;
        this.particleCount = 1200;

        // 천둥/번개 효과
        this.thunderTimer = 0;
        this.nextThunder = 0;

        // 긴급 발판 참조
        this.emergencyPads = {
            snow: null,
            rain: null,
            thunder: null,
        };

        // [모듈 5 & 6] 기상 시각효과 3D 오브젝트
        this.floodBarrier = null;
        this.snowGroundLayer = null;

        this.initParticles();
        this.initWeatherObjects();
    }

    initWeatherObjects() {
        if (!window.modelFactory) return;

        // [모듈 5] 서쪽 출입구 알루미늄 차수판 (X = -21, Z = 0)
        this.floodBarrier = window.modelFactory.createFloodBarrier();
        this.floodBarrier.position.set(-21.0, 0, 0);
        this.floodBarrier.visible = false;
        this.scene.add(this.floodBarrier);

        // [모듈 6] 실외 도로 흰 눈 레이어 바닥
        this.snowGroundLayer = window.modelFactory.createSnowGroundLayer();
        this.snowGroundLayer.visible = false;
        this.scene.add(this.snowGroundLayer);
    }

    initParticles() {
        // 눈 파티클
        const snowGeo = new THREE.BufferGeometry();
        const snowPos = new Float32Array(this.particleCount * 3);
        for (let i = 0; i < this.particleCount; i++) {
            snowPos[i * 3] = (Math.random() - 0.5) * 80;
            snowPos[i * 3 + 1] = Math.random() * 30;
            snowPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
        }
        snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
        const snowMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.35,
            transparent: true,
            opacity: 0.85
        });
        this.snowParticles = new THREE.Points(snowGeo, snowMat);
        this.snowParticles.visible = false;
        this.scene.add(this.snowParticles);

        // 비 파티클
        const rainGeo = new THREE.BufferGeometry();
        const rainPos = new Float32Array(this.particleCount * 3);
        for (let i = 0; i < this.particleCount; i++) {
            rainPos[i * 3] = (Math.random() - 0.5) * 80;
            rainPos[i * 3 + 1] = Math.random() * 35;
            rainPos[i * 3 + 2] = (Math.random() - 0.5) * 80;
        }
        rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
        const rainMat = new THREE.PointsMaterial({
            color: 0x88c0d0,
            size: 0.25,
            transparent: true,
            opacity: 0.75
        });
        this.rainParticles = new THREE.Points(rainGeo, rainMat);
        this.rainParticles.visible = false;
        this.scene.add(this.rainParticles);
    }

    // 새로운 날이 시작될 때 호출 (Day cycle 변경 시)
    onNewDay() {
        // [파트 B 10번] 하루 기상 긴급 작업 카운트 리셋 (하루 최대 2회)
        this.dailyEmergencyCount = 0;
        if (window.gameUI) window.gameUI.hideEmergencyQuest();

        if (this.currentWeather === 'clear') {
            this.clearDaysCount++;
        }

        // 맑은 날이 5일 지속되었으면 다음 날 무조건 기상 악화 발생!
        if (this.clearDaysCount >= GAME_CONFIG.WEATHER.CLEAR_DAYS_THRESHOLD) {
            const badWeathers = ['snow', 'rain', 'thunder'];
            const chosen = badWeathers[Math.floor(Math.random() * badWeathers.length)];
            this.triggerWeather(chosen);
            this.clearDaysCount = 0;
            return;
        }

        // 일반 확률 (35% 확률로 기상 악화 발생)
        if (this.currentWeather === 'clear' && Math.random() < 0.35) {
            const badWeathers = ['snow', 'rain', 'thunder'];
            const chosen = badWeathers[Math.floor(Math.random() * badWeathers.length)];
            this.triggerWeather(chosen);
            this.clearDaysCount = 0;
        }
    }

    // 기상 악화 트리거 (120초 지속)
    triggerWeather(type) {
        this.currentWeather = type;
        this.weatherTimer = GAME_CONFIG.WEATHER.EVENT_DURATION;
        this.isEmergencyResolved = false;
        this.isEmergencyActive = false;

        // [파트 B 10번] 하루 최대 2회 제한 및 시작 20~40초 뒤 랜덤 타이밍에 긴급 발령
        if (this.dailyEmergencyCount < 2) {
            this.emergencyDelayTimer = 20 + Math.random() * 20; // 20~40초 뒤 긴급 작업 발생 예약
        } else {
            this.emergencyDelayTimer = 999999; // 하루 2회 초과 시 일반 기상만 유지
        }

        // 파티클 가시성
        this.snowParticles.visible = (type === 'snow');
        this.rainParticles.visible = (type === 'rain' || type === 'thunder');

        // [모듈 6] 평소에는 눈 레이어를 숨겨두고, 제설 긴급 발령 시에만 눈더미 스폰
        if (this.snowGroundLayer) {
            this.snowGroundLayer.visible = false;
        }

        // [모듈 5] 비/눈 시작 시에는 차수판은 아직 미설치 상태
        if (this.floodBarrier) {
            this.floodBarrier.visible = false;
        }

        // 발판은 긴급 작업 발령 전까지 숨김
        this.updateEmergencyPadsVisibility();

        const weatherInfo = GAME_CONFIG.WEATHER.TYPES[type.toUpperCase()];
        if (window.gameUI) {
            window.gameUI.showNotification(`⚠️ 기상 예보: [${weatherInfo.name}] 시작! (기상 악화 주의)`, '#e74c3c');
            window.gameUI.updateWeatherDisplay(this.currentWeather, this.weatherTimer, true);
            window.gameUI.hideEmergencyQuest();
        }
    }

    // 날씨 해제 (맑음 복귀)
    clearWeather() {
        this.currentWeather = 'clear';
        this.weatherTimer = 0;
        this.isEmergencyActive = false;
        this.isEmergencyResolved = false;
        this.emergencyDelayTimer = 0;
        this.snowParticles.visible = false;
        this.rainParticles.visible = false;

        // [모듈 5 & 6] 차수판 철거 및 눈 레이어 제거
        if (this.floodBarrier) this.floodBarrier.visible = false;
        if (this.snowGroundLayer) this.snowGroundLayer.visible = false;

        this.updateEmergencyPadsVisibility();

        if (window.gameUI) {
            window.gameUI.showNotification(`☀️ 날씨가 다시 맑아졌습니다.`, '#2ecc71');
            window.gameUI.updateWeatherDisplay('clear', 0, true);
            window.gameUI.hideEmergencyQuest();
        }
    }

    // 긴급 조치 완료 (3초 상호작용 완료)
    resolveEmergency() {
        if (!this.isEmergencyActive || this.isEmergencyResolved) return;
        this.isEmergencyActive = false;
        this.isEmergencyResolved = true;

        if (window.soundManager) window.soundManager.playInspectComplete();

        let msg = '';
        if (this.currentWeather === 'snow') {
            msg = '❄️ 제설 작업 완료! 도로의 눈이 치워지고 입고 트럭 운행이 재개됩니다.';
            if (this.snowGroundLayer) this.snowGroundLayer.visible = false;
        } else if (this.currentWeather === 'rain') {
            msg = '🌧️ 차수판 설치 완료! 문턱에 차단벽이 솟아올라 침수를 방지했습니다.';
            if (this.floodBarrier) this.floodBarrier.visible = true;
        } else if (this.currentWeather === 'thunder') {
            msg = '⚡ 비상 발전기 가동 완료! 전력이 정상 복구되었습니다.';
        }

        this.updateEmergencyPadsVisibility();

        if (window.gameUI) {
            window.gameUI.showNotification(msg, '#2ecc71');
            window.gameUI.updateWeatherDisplay(this.currentWeather, this.weatherTimer, this.isEmergencyResolved);
            window.gameUI.hideEmergencyQuest();
        }
    }

    // [파트 B 10번] 발판은 긴급 작업이 필요할 때만 노출
    updateEmergencyPadsVisibility() {
        const needAction = (this.isEmergencyActive && !this.isEmergencyResolved);
        if (this.emergencyPads.snow) {
            this.emergencyPads.snow.visible = (this.currentWeather === 'snow' && needAction);
        }
        if (this.emergencyPads.rain) {
            this.emergencyPads.rain.visible = (this.currentWeather === 'rain' && needAction);
        }
        if (this.emergencyPads.thunder) {
            this.emergencyPads.thunder.visible = (this.currentWeather === 'thunder' && needAction);
        }
    }

    update(delta) {
        if (this.currentWeather !== 'clear') {
            this.weatherTimer -= delta;

            // [파트 B 10번] 기상 시작 후 20~40초 뒤 랜덤 타이밍 긴급 작업 발령
            if (!this.isEmergencyActive && !this.isEmergencyResolved && this.dailyEmergencyCount < 2) {
                this.emergencyDelayTimer -= delta;
                if (this.emergencyDelayTimer <= 0) {
                    this.isEmergencyActive = true;
                    this.dailyEmergencyCount++;

                    // 폭설 시 제설이 필요할 때 소복이 쌓인 눈더미 오브젝트 표시!
                    if (this.currentWeather === 'snow' && this.snowGroundLayer) {
                        this.snowGroundLayer.visible = true;
                    }

                    this.updateEmergencyPadsVisibility();

                    if (window.soundManager) window.soundManager.playAlarm();

                    let emergencyName = '';
                    if (this.currentWeather === 'snow') emergencyName = '제설 작업 필요! (입고 트럭 진입 차단)';
                    else if (this.currentWeather === 'rain') emergencyName = '침수 위기! 서쪽 출입구 차수판 설치 필요!';
                    else if (this.currentWeather === 'thunder') emergencyName = '정전 비상! 좌측 상단 비상 발전기 가동 필요!';

                    if (window.gameUI) {
                        window.gameUI.showNotification(`🚨 긴급 경보 (오늘 ${this.dailyEmergencyCount}/2회): ${emergencyName}`, '#ef4444');
                        window.gameUI.updateWeatherDisplay(this.currentWeather, this.weatherTimer, false);
                        window.gameUI.showEmergencyQuest(this.currentWeather);
                    }
                }
            }

            if (this.weatherTimer <= 0) {
                this.clearWeather();
            } else {
                if (window.gameUI && Math.floor(this.weatherTimer) % 1 === 0) {
                    window.gameUI.updateWeatherDisplay(this.currentWeather, this.weatherTimer, this.isEmergencyResolved || !this.isEmergencyActive);
                }
            }
        }

        // 눈 파티클 애니메이션
        if (this.snowParticles && this.snowParticles.visible) {
            const pos = this.snowParticles.geometry.attributes.position.array;
            for (let i = 1; i < pos.length; i += 3) {
                pos[i] -= delta * 5.0;
                if (pos[i] < 0) pos[i] = 28;
            }
            this.snowParticles.geometry.attributes.position.needsUpdate = true;
        }

        // 비 파티클 애니메이션
        if (this.rainParticles && this.rainParticles.visible) {
            const pos = this.rainParticles.geometry.attributes.position.array;
            for (let i = 1; i < pos.length; i += 3) {
                pos[i] -= delta * 25.0;
                if (pos[i] < 0) pos[i] = 30;
            }
            this.rainParticles.geometry.attributes.position.needsUpdate = true;
        }

        // 뇌우 천둥 번개 효과
        if (this.currentWeather === 'thunder') {
            this.thunderTimer += delta;
            if (this.thunderTimer > this.nextThunder) {
                this.thunderTimer = 0;
                this.nextThunder = 4 + Math.random() * 8; // 4~12초 간격
                if (window.soundManager) window.soundManager.playThunder();
                this.triggerLightningFlash();
            }
        }

        // 발전기 경광등 비상 점멸 연출
        if (window.game && window.game.logistics && window.game.logistics.generatorFacility) {
            const beacon = window.game.logistics.generatorFacility.beacon;
            if (beacon) {
                if (this.currentWeather === 'thunder' && this.isEmergencyActive && !this.isEmergencyResolved) {
                    beacon.material.color.setHex((Math.sin(Date.now() * 0.015) > 0) ? 0xef4444 : 0x450a0a);
                } else if (this.currentWeather === 'thunder' && this.isEmergencyResolved) {
                    beacon.material.color.setHex(0x10b981); // 정상 복구 초록불
                } else {
                    beacon.material.color.setHex(0x475569); // 평시 대기
                }
            }
        }

        // [파트 B 10번] 긴급 작업이 필요할 때만 발판 0.5초 주기 붉은 깜빡임(Blink) 점멸 연출
        const isBlinkOn = (Math.floor(Date.now() / 500) % 2 === 0);
        ['snow', 'rain', 'thunder'].forEach(type => {
            const p = this.emergencyPads[type];
            if (p && p.visible && this.isEmergencyActive && !this.isEmergencyResolved) {
                if (p.ringMesh && p.ringMesh.material) {
                    p.ringMesh.material.color.setHex(0xef4444);
                    p.ringMesh.material.opacity = isBlinkOn ? 0.95 : 0.2;
                }
                if (p.innerMesh && p.innerMesh.material) {
                    p.innerMesh.material.color.setHex(0xef4444);
                    p.innerMesh.material.opacity = isBlinkOn ? 0.55 : 0.08;
                }
            }
        });
    }

    triggerLightningFlash() {
        const flashOverlay = document.getElementById('lightning-flash');
        if (flashOverlay) {
            flashOverlay.style.opacity = '0.8';
            setTimeout(() => {
                flashOverlay.style.opacity = '0.0';
            }, 120);
        }
    }

    // 현재 입고 가능 여부 (눈 미조치 시 중지)
    canInboundOperate() {
        if (this.currentWeather === 'snow' && this.isEmergencyActive && !this.isEmergencyResolved) {
            return false;
        }
        return true;
    }

    // 플레이어/알바 이동속도 배율 (비 미조치 시 0.55배)
    getSpeedMultiplier() {
        if (this.currentWeather === 'rain' && this.isEmergencyActive && !this.isEmergencyResolved) {
            return 0.55;
        }
        return 1.0;
    }

    // 작업 속도 배율 (뇌우 미조치 시 정전으로 0.4배)
    getWorkSpeedMultiplier() {
        if (this.currentWeather === 'thunder' && this.isEmergencyActive && !this.isEmergencyResolved) {
            return 0.4;
        }
        return 1.0;
    }
}

window.WeatherManager = WeatherManager;
