
'use strict';

import async from 'async';

import db from '../database';
import user from '../user';

module.exports = function (Topics: { getUserBookmark: (tid: any, uid: string) => Promise<any>; getUserBookmarks: (tids: any[], uid: string) => Promise<any>; setUserBookmark: (arg0: any, arg1: any, arg2: number) => any; getTopicBookmarks: (arg0: any) => any; updateTopicBookmarks: (tid: any, pids: string | any[]) => Promise<void>; getPostCount: (arg0: any) => any; }) {
    Topics.getUserBookmark = async function (tid: any, uid: string) {
        if (parseInt(uid, 10) <= 0) {
            return null;
        }
        return await db.sortedSetScore(`tid:${tid}:bookmarks`, uid);
    };

    Topics.getUserBookmarks = async function (tids: any[], uid: string) {
        if (parseInt(uid, 10) <= 0) {
            return tids.map(() => null);
        }
        return await db.sortedSetsScore(tids.map(tid => `tid:${tid}:bookmarks`), uid);
    };

    Topics.setUserBookmark = async function (tid: any, uid: any, index: any) {
        await db.sortedSetAdd(`tid:${tid}:bookmarks`, index, uid);
    };

    Topics.getTopicBookmarks = async function (tid: any) {
        return await db.getSortedSetRangeWithScores(`tid:${tid}:bookmarks`, 0, -1);
    };

    Topics.updateTopicBookmarks = async function (tid: any, pids: string | any[]) {
        const maxIndex = await Topics.getPostCount(tid);
        const indices = await db.sortedSetRanks(`tid:${tid}:posts`, pids);
        const postIndices = indices.map((i: number | null) => (i === null ? 0 : i + 1));
        const minIndex = Math.min(...postIndices);

        const bookmarks = await Topics.getTopicBookmarks(tid);

        const uidData = bookmarks.map((b: { value: any; score: string; }) => ({ uid: b.value, bookmark: parseInt(b.score, 10) }))
            .filter((data: { bookmark: number; }) => data.bookmark >= minIndex);

        await async.eachLimit(uidData, 50, async (data) => {
            let bookmark = Math.min(data.bookmark, maxIndex);

            postIndices.forEach((i: number) => {
                if (i < data.bookmark) {
                    bookmark -= 1;
                }
            });

            // make sure the bookmark is valid if we removed the last post
            bookmark = Math.min(bookmark, maxIndex - pids.length);
            if (bookmark === data.bookmark) {
                return;
            }

            const settings = await user.getSettings(data.uid);
            if (settings.topicPostSort === 'most_votes') {
                return;
            }

            await Topics.setUserBookmark(tid, data.uid, bookmark);
        });
    };
};
