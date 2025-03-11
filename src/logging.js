// 1. 로깅하고 싶은 이벤트 목록 (유저 입력/상호작용 제외)
const pageLoadEvents = [
    'DOMContentLoaded',
    'load',
    'pageshow',
    'pagehide',
    'beforeunload',
    'unload',
    'hashchange',
    'popstate',
    'readystatechange',
    'loadstart',
    'loadeddata',
    'loadedmetadata',
    'canplay',
    'canplaythrough',
    'durationchange',
    'ended',
    'online',
    'offline',
    'visibilitychange',
    'fullscreenchange',
  ];
  
  // 2. document/ window 등 적절한 대상에 이벤트 리스너 등록
  function logInitialLoadEvents(events) {
    events.forEach(evtName => {
      // 대부분 문서 관련 이벤트는 document에,
      // unload 등 윈도우 이벤트는 window에 거는 방법 등으로 구분 가능:
      // 여기서는 간단히 window와 document 모두 리스너 설정 (중복 발생 방지 위해 한번만)
      window.addEventListener(evtName, e => {
        console.debug(`[window -> ${evtName}] fired`, e);
      });
      document.addEventListener(evtName, e => {
        console.debug(`[document -> ${evtName}] fired`, e);
      });
    });
  }
  
  // 3. 실행
  logInitialLoadEvents(pageLoadEvents);