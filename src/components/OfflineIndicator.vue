<script setup lang="ts">
import { CloudDownload, CloudOff } from '@vicons/tabler';

const { t } = useI18n();

const isOnline = useOnline();
const isCacheReady = ref(false);
const isReadyDismissed = useStorage('campus-toolbox.offlineTipDismissed', false);

onMounted(async () => {
  if (!('serviceWorker' in navigator)) {
    return;
  }
  try {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) {
      isCacheReady.value = true;
    }
  }
  catch {
  }
});
</script>

<template>
  <div>
    <Transition name="offline-fade">
      <div v-if="!isOnline" class="offline-bar offline-bar--off">
        <n-icon :component="CloudOff" :size="18" />
        <span>{{ t('offline.title') }}</span>
        <span class="offline-hint">{{ t('offline.hint') }}</span>
      </div>
    </Transition>

    <Transition name="offline-fade">
      <div v-if="isOnline && isCacheReady && !isReadyDismissed" class="offline-bar offline-bar--ready">
        <n-icon :component="CloudDownload" :size="18" />
        <span>{{ t('offline.cacheReady') }}</span>
        <button class="offline-close" type="button" @click="isReadyDismissed = true">
          {{ t('offline.dismiss') }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style lang="less" scoped>
.offline-bar {
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 1000;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  max-width: min(92vw, 720px);
  padding: 9px 16px;
  border-radius: 999px;
  font-size: 13px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(6px);
}

.offline-bar--off {
  background: rgba(208, 48, 80, 0.94);
  color: #fff;
}

.offline-bar--ready {
  background: rgba(24, 160, 88, 0.94);
  color: #fff;
}

.offline-hint {
  opacity: 0.85;
}

.offline-close {
  padding: 2px 10px;
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font-size: 12px;
  cursor: pointer;
}

.offline-close:hover {
  background: rgba(255, 255, 255, 0.18);
}

.offline-fade-enter-active,
.offline-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.offline-fade-enter-from,
.offline-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}
</style>
