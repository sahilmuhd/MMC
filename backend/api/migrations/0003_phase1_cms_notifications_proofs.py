# Generated for Phase 1 of the MMC/ZAH admin upgrade (see project audit).
# Hand-written to match the style of 0001/0002 -- regenerate with
# `manage.py makemigrations` and diff against this file before applying,
# in case local model state has drifted since this was written.

import api.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0002_alter_user_options_user_member_id_user_mobile_and_more'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='user',
            options={
                'ordering': ['id'],
                'permissions': [
                    ('view_members', 'Can view members'),
                    ('add_members', 'Can add members'),
                    ('edit_members', 'Can edit members'),
                    ('remove_members', 'Can remove/deactivate members'),
                    ('view_hierarchy', 'Can view member hierarchy'),
                    ('edit_hierarchy', 'Can edit hierarchy-related information'),
                    ('view_goals', 'Can view goals'),
                    ('create_goals', 'Can create goals'),
                    ('edit_goals', 'Can edit goals'),
                    ('approve_achievements', 'Can approve/reject goal achievements'),
                    ('view_points', 'Can view points'),
                    ('edit_points', 'Can edit/adjust points'),
                    ('view_income', 'Can view income'),
                    ('edit_income', 'Can edit income status'),
                    ('view_reports', 'Can view admin reports/dashboard'),
                    ('upload_photos', 'Can upload member photos'),
                    ('edit_photos', 'Can replace member photos'),
                    ('delete_photos', 'Can delete member photos'),
                    ('view_audit_logs', 'Can view audit logs'),
                    ('edit_site_content', 'Can edit public site content (homepage, team, products)'),
                    ('view_messages', 'Can view contact messages'),
                    ('manage_messages', 'Can reply to/delete contact messages'),
                ],
            },
        ),
        migrations.AlterModelOptions(
            name='contactsubmission',
            options={'ordering': ['-created_at']},
        ),
        migrations.AddField(
            model_name='contactsubmission',
            name='is_read',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='contactsubmission',
            name='is_archived',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='contactsubmission',
            name='admin_reply',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='contactsubmission',
            name='replied_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='contactsubmission',
            name='replied_by',
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                related_name='+', to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.CreateModel(
            name='AchievementProof',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file', models.FileField(upload_to=api.models.achievement_proof_path)),
                ('original_name', models.CharField(blank=True, max_length=255)),
                ('content_type', models.CharField(blank=True, max_length=100)),
                ('size', models.PositiveIntegerField(default=0)),
                ('uploaded_at', models.DateTimeField(auto_now_add=True)),
                ('achievement', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='proofs', to='api.goalachievement')),
                ('uploaded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-uploaded_at'],
            },
        ),
        migrations.CreateModel(
            name='SiteContent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(db_index=True, max_length=100, unique=True)),
                ('data', models.JSONField(blank=True, default=dict)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['key'],
            },
        ),
        migrations.CreateModel(
            name='TeamMember',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=150)),
                ('position', models.CharField(blank=True, max_length=150)),
                ('photo', models.ImageField(blank=True, null=True, upload_to='team_photos/')),
                ('description', models.TextField(blank=True)),
                ('social_links', models.JSONField(blank=True, default=dict)),
                ('is_active', models.BooleanField(default=True)),
                ('order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['order', 'id'],
            },
        ),
        migrations.CreateModel(
            name='Product',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('price', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('images', models.JSONField(blank=True, default=list)),
                ('features', models.JSONField(blank=True, default=list)),
                ('is_active', models.BooleanField(default=True)),
                ('order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['order', 'id'],
            },
        ),
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event', models.CharField(choices=[
                    ('new_member', 'New member registered'),
                    ('new_achievement_submission', 'New achievement submitted'),
                    ('achievement_needs_review', 'Achievement requires review'),
                    ('achievement_approved', 'Achievement approved'),
                    ('achievement_rejected', 'Achievement rejected'),
                    ('points_received', 'Points received'),
                    ('income_pending_approval', 'Income requires approval'),
                    ('income_approved', 'Income approved'),
                    ('income_paid', 'Income paid'),
                    ('sponsor_reassigned', 'Sponsor reassigned'),
                    ('system', 'System notice'),
                ], max_length=40)),
                ('title', models.CharField(max_length=200)),
                ('body', models.TextField(blank=True)),
                ('target_model', models.CharField(blank=True, max_length=100)),
                ('target_id', models.CharField(blank=True, max_length=50)),
                ('is_read', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='notification',
            index=models.Index(fields=['recipient', 'is_read'], name='api_notific_recipie_idx'),
        ),
    ]
