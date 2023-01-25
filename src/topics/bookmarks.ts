
'use strict';

import async from 'async';

import db from '../database';
import user from '../user';

module.exports = function (Topics) {
    Topics.getUserBookmark = async function (tid: string, uid: string) {
        if (parseInt(uid, 10) <= 0) {
            return null;
        }
        return await db.sortedSetScore(`tid:${tid}:bookmarks`, uid);
    };

    Topics.getUserBookmarks = async function (tids: string[], uid: string) {
        if (parseInt(uid, 10) <= 0) {
            return tids.map(() => null);
        }
        return await db.sortedSetsScore(tids.map(tid => `tid:${tid}:bookmarks`), uid);
    };

    Topics.setUserBookmark = async function (tid: string, uid: string, index: string) {
        await db.sortedSetAdd(`tid:${tid}:bookmarks`, index, uid);
    };

    Topics.getTopicBookmarks = async function (tid:string) {
        return await db.getSortedSetRangeWithScores(`tid:${tid}:bookmarks`, 0, -1);
    };

    Topics.updateTopicBookmarks = async function (tid:string , pids:string[]) {
        const maxIndex = await Topics.getPostCount(tid);
        const indices = await db.sortedSetRanks(`tid:${tid}:posts`, pids);
        const postIndices = indices.map((i: number | null) => (i === null ? 0 : i + 1));
        const minIndex = Math.min(...postIndices);

        const bookmarks = await Topics.getTopicBookmarks(tid);

        const uidData = bookmarks.map((b: { value: any; score: string; }) => ({ uid: b.value, bookmark: parseInt(b.score, 10) }))
            .filter((data: { bookmark: number; }) => data.bookmark >= minIndex);

        await async.eachLimit(uidData, 50, async (data: {bookmark: any, uid: any}) => {
            let bookmark = Math.min(data.bookmark, maxIndex);

            postIndices.forEach((i) => {
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
