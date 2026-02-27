require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connecté à MongoDB');

  const result = await mongoose.connection.collection('users').updateMany(
    { role: 'superadmin' },
    { $set: { role: 'developer' } }
  );
  console.log(`superadmin → developer : ${result.modifiedCount} utilisateur(s) mis à jour`);

  const result2 = await mongoose.connection.collection('users').updateMany(
    { role: 'vip' },
    { $set: { role: 'user' } }
  );
  console.log(`vip → user : ${result2.modifiedCount} utilisateur(s) mis à jour`);

  const all = await mongoose.connection.collection('users').find({}, { projection: { username: 1, role: 1 } }).toArray();
  console.log('\nUtilisateurs après migration :');
  all.forEach(u => console.log(`  ${u.username} → ${u.role}`));

  await mongoose.disconnect();
  console.log('\nMigration terminée !');
}

migrate().catch(err => { console.error(err); process.exit(1); });
