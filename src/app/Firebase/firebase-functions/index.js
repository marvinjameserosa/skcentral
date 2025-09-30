// src/app/Firebase/firebase-functions/index.js
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

// ------------------- Delete User Account -------------------
exports.deleteUserAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const uidToDelete = data.uid;
  if (!uidToDelete) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The function must be called with a user UID to delete.'
    );
  }

  try {
    // Delete user from Firebase Auth
    await admin.auth().deleteUser(uidToDelete);
    console.log(`Deleted user from Auth: ${uidToDelete}`);

    // Delete user document from Firestore
    const firestore = admin.firestore();
    const querySnapshot = await firestore.collection('adminUsers').where('uid', '==', uidToDelete).get();
    
    if (!querySnapshot.empty) {
      await querySnapshot.docs[0].ref.delete();
      console.log(`Deleted user document from Firestore: ${uidToDelete}`);
    } else {
      console.warn(`No Firestore document found for UID: ${uidToDelete}`);
    }

    return { success: true, message: `User ${uidToDelete} deleted successfully.` };
  } catch (error) {
    console.error(`Error deleting user ${uidToDelete}:`, error);
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', `User with UID ${uidToDelete} not found.`);
    }
    throw new functions.https.HttpsError('internal', 'Failed to delete user account.', error.message);
  }
});

// ------------------- Reset User Password -------------------
exports.resetUserPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'The function must be called while authenticated.'
    );
  }

  const uidToReset = data.uid;
  if (!uidToReset) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'The function must be called with a user UID to reset password.'
    );
  }

  try {
    await admin.auth().updateUser(uidToReset, {
      password: "skcentralmarikina", // Default password
    });

    console.log(`Password reset for UID: ${uidToReset}`);
    return { success: true, message: `Password reset successfully. Default password: "skcentralmarikina".` };
  } catch (error) {
    console.error(`Error resetting password for UID ${uidToReset}:`, error);
    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError('not-found', `User with UID ${uidToReset} not found.`);
    }
    throw new functions.https.HttpsError('internal', 'Failed to reset user password.', error.message);
  }
});
