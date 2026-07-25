# WebSocket Hooks Flow Chart

All routes start at React hooks defined in `WebsocketHook.ts`. This chart shows happy flows and error paths.

## 📚 Navigation

### External Links

- **[Package README](../../README.md)** — Package overview and quick start
- **[CONNECTION CHARTS](./WEBSOCKET_CONNECTION.md)** — Return to workspace overview

---

## Full Chart

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': { 'primaryColor': '#374151', 'primaryTextColor': '#f9fafb', 'lineColor': '#94a3b8', 'secondaryColor': '#1f2937', 'tertiaryColor': '#4b5563', 'clusterBkg': '#1f2937', 'clusterBorder': '#6b7280' }}}%%
flowchart TB

    %% ─── Node declarations ──────────────────────────────────────────
    %% Each node declared exactly once, inside its subgraph.
    %% All edges are below, outside any subgraph.

    subgraph Hooks["React Hooks (WebsocketHook.ts)"]
        useSub[useWebsocketSubscription]
        useSubByKey[useWebsocketSubscriptionByKey]
        useMsg[useWebsocketMessage]
    end

    subgraph useSubFlow["useWebsocketSubscription Flow"]
        createSubscriptionApi[createWebsocketSubscriptionApi]
        syncSubOptions[Sync options via layout effect]
        subApi[WebsocketSubscriptionApiPublic]
    end

    subgraph useSubByKeyFlow["useWebsocketSubscriptionByKey Flow"]
        getListener[client.getListener - subscription]
        checkKey{Listener exists?}
        returnStore[Return subscription.store]
        fallbackStore[Return fallbackStore]
    end

    subgraph useMsgFlow["useWebsocketMessage Flow"]
        createMsgApi[createWebsocketMessageApi]
        syncMsgOptions[Sync options via layout effect]
        msgApi[WebsocketMessageApiPublic]
    end

    subgraph lifecycle["useWebsocketLifecycle - shared"]
        useLifecycle1[useWebsocketLifecycle - sub]
        useLifecycle2[useWebsocketLifecycle - msg]
        layout1{enabled !== false?}
        addConnection[client.addConnection]
        addListener[connection.addListener]
        listenerDisconnect[listener.disconnect]
        layout2[connection.replaceUrl on url change]
        effect1[registerHook]
        effect2[unregisterHook on cleanup]
    end

    subgraph connection["WebsocketConnection"]
        getExisting{Connection exists?}
        newConn[new WebsocketConnection]
        connect[connect]
        wsOpen[WebSocket OPEN]
        handleOpen[handleOpen]
        notifyListeners[Notify listeners.onOpen]
        schedulePing{heartbeat.enabled?}
        schedulePingTimer[schedulePing]
    end

    subgraph happyMessage["Incoming Message"]
        handleMsg[handleMessage]
        parseMsg[JSON.parse]
        validMsg{Valid message?}
        isPing{uri === ping?}
        clearPong[clearPongTimeout / schedulePing]
        isError{isErrorMethod?}
        routeMsg[forEachMatchingListener]
        onMessage[listener.onMessage / deliverMessage]
    end

    subgraph errorFlow["Errors and Reconnection"]
        invalidMsg[connectionEvent - invalid-message]
        onErrorTransport[listener.onError transport]
        parseErr[connectionEvent - parse-error]
        serverErr[connectionEvent - message-error]
        onMsgErr[listener.onMessageError]
        wsErr[handleError]
        handleClose[handleClose]
        reconnectable{Reconnectable close code?}
        attemptReconnect[attemptReconnection]
        maxRetries{retries >= MAX?}
        showMaxRetries[connectionEvent - max-retries-exceeded]
        deferOffline[deferReconnectionUntilOnline]
        pongTimeout[connectionEvent - pong-timeout]
        teardown[teardownSocket]
        replaceUrlFlow[replaceUrl]
        teardownReconnect[teardownAndReconnect]
        offline[handleOffline]
        online[handleOnline]
        onlineReconnect[handleOnlineForReconnection]
        waitOnline[wait for online]
        waitBackoff[wait backoff]
        cleanup[cleanupConnection]
    end

    subgraph disconnectFlow["Disconnect Flow"]
        removeListener[removeWebsocketListenerFromConnection]
        connectionRemove[connection.removeListener]
        clientRemove[client.removeListener]
        scheduleCleanup[scheduleConnectionCleanup]
        unregisterHook[unregisterHook]
    end

    %% ─── Edges ──────────────────────────────────────────────────────

    %% Subscription hook
    useSub --> createSubscriptionApi
    useSub --> syncSubOptions
    useSub --> useLifecycle1
    useSub -->|return| subApi

    %% ByKey hook
    useSubByKey --> getListener
    getListener --> checkKey
    checkKey -->|yes| returnStore
    checkKey -->|no| fallbackStore

    %% Message hook
    useMsg --> createMsgApi
    useMsg --> syncMsgOptions
    useMsg --> useLifecycle2
    useMsg -->|return| msgApi

    %% Lifecycle
    useLifecycle1 --> layout1
    useLifecycle2 --> layout1
    layout1 -->|yes| addConnection
    layout1 -->|no| listenerDisconnect
    layout2 --> teardownReconnect
    layout1 --> effect1
    effect1 --> effect2

    %% Lifecycle → Connection
    addConnection --> getExisting
    getExisting -->|yes| addListener
    getExisting -->|no| newConn
    newConn --> addListener
    addListener --> connect
    connect --> wsOpen
    wsOpen --> handleOpen
    handleOpen --> notifyListeners
    handleOpen --> schedulePing
    schedulePing -->|yes| schedulePingTimer
    schedulePing -.->|no pong| pongTimeout
    wsOpen -.->|message event| handleMsg

    %% Happy message path
    handleMsg --> parseMsg
    parseMsg --> validMsg
    validMsg -->|yes| isPing
    validMsg -->|no| invalidMsg
    isPing -->|yes| clearPong
    isPing -->|no| isError
    isError -->|no| routeMsg
    isError -->|yes| serverErr
    routeMsg --> onMessage

    %% Error paths
    invalidMsg --> onErrorTransport
    parseMsg -.->|catch| parseErr
    parseErr --> onErrorTransport
    serverErr --> onMsgErr
    wsOpen -.->|error event| wsErr
    wsErr --> onErrorTransport
    wsOpen -.->|close event| handleClose
    handleClose --> reconnectable
    reconnectable -->|yes| attemptReconnect
    reconnectable -->|no| cleanup
    attemptReconnect --> maxRetries
    maxRetries -->|yes| showMaxRetries
    maxRetries -->|no| deferOffline
    deferOffline -->|offline| waitOnline
    deferOffline -->|online| waitBackoff
    waitBackoff --> connect
    waitOnline -.->|online event| onlineReconnect
    onlineReconnect --> attemptReconnect
    pongTimeout --> teardown
    teardown --> attemptReconnect
    replaceUrlFlow --> teardownReconnect
    teardownReconnect --> connect
    offline --> teardown
    teardown --> waitOnline
    waitOnline -.->|online after offline| online
    online --> connect

    %% Disconnect flow
    listenerDisconnect --> removeListener
    removeListener --> connectionRemove
    removeListener --> clientRemove
    connectionRemove --> scheduleCleanup
    effect2 -->|unmount| unregisterHook
    unregisterHook -->|last hook| removeListener

    %% Styling
    style useSub fill:#16a34a,stroke:#15803d,color:#fff
    style useSubByKey fill:#16a34a,stroke:#15803d,color:#fff
    style useMsg fill:#16a34a,stroke:#15803d,color:#fff
    style onMessage fill:#15803d,stroke:#166534,color:#fff
    style returnStore fill:#15803d,stroke:#166534,color:#fff
    style subApi fill:#15803d,stroke:#166534,color:#fff
    style msgApi fill:#15803d,stroke:#166534,color:#fff
    style invalidMsg fill:#dc2626,stroke:#b91c1c,color:#fff
    style parseErr fill:#dc2626,stroke:#b91c1c,color:#fff
    style serverErr fill:#dc2626,stroke:#b91c1c,color:#fff
    style wsErr fill:#dc2626,stroke:#b91c1c,color:#fff
    style showMaxRetries fill:#dc2626,stroke:#b91c1c,color:#fff
```

## Legend

| Color | Meaning |
|-------|---------|
| Dark green | Entry points (hooks) |
| Medium green | Success states / happy path outcomes |
| Dark red | Error paths |

## Hook Entry Points

1. **useWebsocketSubscription** → createWebsocketSubscriptionApi (useState) + sync options via layout effect + useWebsocketLifecycle → WebsocketSubscriptionApiPublic
2. **useWebsocketSubscriptionByKey** → client.getListener(key, 'subscription') → subscription.store or fallbackStore
3. **useWebsocketMessage** → createWebsocketMessageApi (useState) + sync options via layout effect + useWebsocketLifecycle → WebsocketMessageApiPublic

## Key Flows

- **Happy**: Hook mounts → lifecycle → client.addConnection → addListener → connect → open → onOpen → messages routed via forEachMatchingListener → onMessage/deliverMessage
- **URL change**: layout effect watches url → client.getConnection(url)?.replaceUrl(url) → teardownAndReconnect → connect with new URL
- **Options sync**: Both `useWebsocketSubscription` and `useWebsocketMessage` sync their options to the API via a `useIsomorphicLayoutEffect` after each render where options changed (deep-compared). Subscription API re-subscribes on body/enabled change only when already connected (`_resubscribeIfConnected`); Message API updates config fields only.
- **Enabled=false**: options setter calls unsubscribe (SubscriptionApi) → hook calls listener.disconnect → removeWebsocketListenerFromConnection
- **Errors**: invalid/parse/server → connectionEvent + onError/onMessageError; close → reconnect or max retries; offline → defer until online; pong timeout → teardown → attemptReconnection
- **Manual retry**: WebsocketClient.reconnectAllConnections() → each connection.reconnect() → teardownAndReconnect → connect
